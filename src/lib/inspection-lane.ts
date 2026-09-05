import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { prisma } from "@/lib/prisma";
import type { InspectionLane } from "@prisma/client";

// "Luồng kiểm tra" (Xanh/Vàng/Đỏ) của NV cấy mô — TỰ TÍNH đầu mỗi tháng từ tỉ lệ nhiễm TỔNG HỢP của
// tháng trước, không còn do Kho mô cài đặt tay (xem prisma/schema.prisma model InspectionLaneMonthlyResult
// + enum InspectionLane). Vàng và Đỏ xử lý bàn giao GIỐNG HỆT nhau (đều phải Kho mô kiểm tra lại — xem
// receive-phong-toi/do-lane), chỉ khác nhãn hiển thị để NV biết mức độ đang ở đâu.
//
// Tỉ lệ nhiễm TỔNG HỢP = A (tỉ lệ nhiễm ủ tối) + B (tỉ lệ nhiễm mẫu mẹ bàn giao), tính RIÊNG rồi CỘNG LẠI
// (không gộp chung tử/mẫu số):
//   A = trung bình cộng tỉ lệ nhiễm của TỪNG PHIẾU BÀN GIAO (Transfer phòng tối → kho sáng, đã CONFIRMED)
//       trong tháng — mỗi phiếu tự có 1 tỉ lệ = tổng contaminatedQuantity / tổng initialQuantity của các
//       LotInspectionItem (NV tự kiểm tra sau đủ ngày ủ tối) thuộc các lô trong phiếu đó. Đây là số liệu
//       NV cấy mô tự nhập/tự kiểm tra — có sẵn cho MỌI luồng (kể cả Xanh, vì bước tự kiểm tra trước bàn
//       giao là bắt buộc với mọi lô, không phụ thuộc luồng) nên không sợ "Xanh mãi không ai kiểm tra".
//   B = trung bình cộng tỉ lệ nhiễm của TỪNG CHỈ ĐỊNH CẤY (không tính chỉ định dự phòng — isBackup, và
//       không tính Chỉ định cấy xử lý vì đó là model RepackInstruction riêng) có weekStart trong tháng,
//       gán cho đúng NV này — tỉ lệ 1 chỉ định = tổng DailyRecord.motherContaminatedM05 / inputMotherQuantity
//       của chỉ định đó (cùng công thức /api/reports/mother-contamination) — cũng là số NV tự nhập hàng
//       ngày, không phụ thuộc luồng.
//
// Cả A và B đều lấy trung bình CỘNG các tỉ lệ (không lấy tổng nhiễm/tổng số rồi chia 1 lần) — 1 phiếu/1
// chỉ định nhỏ vẫn có trọng số ngang 1 phiếu/1 chỉ định lớn, đúng theo ví dụ Admin đưa ra.

const LOW_THRESHOLD_PCT = 10; // < 10% = Xanh
const HIGH_THRESHOLD_PCT = 15; // 10-15% = Vàng (bao gồm đúng 15%), > 15% = Đỏ

export function classifyLane(combinedRatePct: number): InspectionLane {
  if (combinedRatePct < LOW_THRESHOLD_PCT) return "XANH";
  if (combinedRatePct <= HIGH_THRESHOLD_PCT) return "VANG";
  return "DO";
}

type MonthlyContaminationStats = {
  darkRoomRatePct: number;
  darkRoomSampleCount: number;
  brightRoomRatePct: number;
  brightRoomSampleCount: number;
  combinedRatePct: number;
  hasData: boolean;
};

// A — xem giải thích ở đầu file. `dataMonthStart`/`dataMonthEnd` là 1 tháng dương lịch trọn vẹn.
async function computeDarkRoomRate(staffId: string, dataMonthStart: Date, dataMonthEnd: Date): Promise<{ ratePct: number; sampleCount: number }> {
  const transfers = await prisma.transfer.findMany({
    where: {
      status: "CONFIRMED",
      fromUserId: staffId,
      fromRoom: { type: "PHONG_TOI" },
      confirmedAt: { gte: dataMonthStart, lte: dataMonthEnd },
    },
    select: { items: { select: { lotId: true } } },
  });
  if (transfers.length === 0) return { ratePct: 0, sampleCount: 0 };

  const allLotIds = Array.from(new Set(transfers.flatMap((t) => t.items.map((i) => i.lotId))));
  const inspectionItems = await prisma.lotInspectionItem.findMany({
    where: { lotId: { in: allLotIds } },
    select: { lotId: true, initialQuantity: true, contaminatedQuantity: true, lot: { select: { instruction: { select: { isBackup: true } } } } },
  });
  const byLotId = new Map<string, { initial: number; contaminated: number }>();
  for (const item of inspectionItems) {
    // Bỏ qua lô từ chỉ định dự phòng — xem lưu ý ở đầu file.
    if (item.lot.instruction?.isBackup) continue;
    const entry = byLotId.get(item.lotId) ?? { initial: 0, contaminated: 0 };
    entry.initial += item.initialQuantity;
    entry.contaminated += item.contaminatedQuantity;
    byLotId.set(item.lotId, entry);
  }

  const rates: number[] = [];
  for (const t of transfers) {
    let initial = 0;
    let contaminated = 0;
    for (const item of t.items) {
      const found = byLotId.get(item.lotId);
      if (!found) continue; // lô dự phòng đã bị loại ở trên, hoặc chưa có dữ liệu tự kiểm tra
      initial += found.initial;
      contaminated += found.contaminated;
    }
    if (initial > 0) rates.push((contaminated / initial) * 100);
  }
  if (rates.length === 0) return { ratePct: 0, sampleCount: 0 };
  return { ratePct: rates.reduce((s, r) => s + r, 0) / rates.length, sampleCount: rates.length };
}

// B — xem giải thích ở đầu file.
async function computeBrightRoomRate(staffId: string, dataMonthStart: Date, dataMonthEnd: Date): Promise<{ ratePct: number; sampleCount: number }> {
  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      assignedToId: staffId,
      isBackup: false,
      weekStart: { gte: dataMonthStart, lte: dataMonthEnd },
    },
    select: { inputMotherQuantity: true, dailyRecords: { select: { motherContaminatedM05: true } } },
  });
  const rates: number[] = [];
  for (const inst of instructions) {
    if (inst.inputMotherQuantity <= 0) continue;
    const totalContaminated = inst.dailyRecords.reduce((s, r) => s + r.motherContaminatedM05, 0);
    rates.push((totalContaminated / inst.inputMotherQuantity) * 100);
  }
  if (rates.length === 0) return { ratePct: 0, sampleCount: 0 };
  return { ratePct: rates.reduce((s, r) => s + r, 0) / rates.length, sampleCount: rates.length };
}

export async function computeMonthlyContaminationStats(staffId: string, dataMonth: Date): Promise<MonthlyContaminationStats> {
  const dataMonthStart = startOfMonth(dataMonth);
  const dataMonthEnd = endOfMonth(dataMonth);
  const [darkRoom, brightRoom] = await Promise.all([
    computeDarkRoomRate(staffId, dataMonthStart, dataMonthEnd),
    computeBrightRoomRate(staffId, dataMonthStart, dataMonthEnd),
  ]);
  return {
    darkRoomRatePct: darkRoom.ratePct,
    darkRoomSampleCount: darkRoom.sampleCount,
    brightRoomRatePct: brightRoom.ratePct,
    brightRoomSampleCount: brightRoom.sampleCount,
    combinedRatePct: darkRoom.ratePct + brightRoom.ratePct,
    hasData: darkRoom.sampleCount > 0 || brightRoom.sampleCount > 0,
  };
}

// Gọi lazy từ layout (giống mọi ensureXxx khác) — KHÔNG gán theo role vì ảnh hưởng TOÀN BỘ NV cấy mô
// cùng lúc, không phải theo phiên của 1 người đang xem trang. Tính cho THÁNG HIỆN TẠI (applyMonth) từ dữ
// liệu THÁNG TRƯỚC (dataMonth) — dedup qua @@unique([staffId, applyMonth]), chỉ tính 1 lần/NV/tháng dù
// hàm này được gọi lại nhiều lần trong cùng tháng.
export async function ensureMonthlyInspectionLaneUpdate(): Promise<void> {
  // format rồi parse lại (thay vì dùng thẳng startOfMonth) — startOfMonth trả về nửa đêm giờ ĐỊA PHƯƠNG,
  // khi Prisma ghi vào cột @db.Date sẽ lấy phần ngày theo GIỜ UTC nên có thể lùi mất 1 ngày nếu server ở
  // múi giờ dương (VD UTC+7: 00:00 01/09 giờ VN = 17:00 31/08 UTC, ghi nhầm applyMonth = tháng 8). Cùng kỹ
  // thuật với getTaskMonth (src/lib/rooting-forecast.ts).
  const applyMonth = new Date(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const dataMonth = subMonths(applyMonth, 1);

  const staffList = await prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { id: true } });
  for (const s of staffList) {
    const existing = await prisma.inspectionLaneMonthlyResult.findUnique({
      where: { staffId_applyMonth: { staffId: s.id, applyMonth } },
      select: { id: true },
    });
    if (existing) continue;

    const { hasData, ...stats } = await computeMonthlyContaminationStats(s.id, dataMonth);
    // Chưa có chỉ định/phiếu bàn giao hợp lệ nào tháng trước (NV mới, hoặc tháng trước chỉ làm chỉ định
    // dự phòng/xử lý) — không đủ căn cứ đánh giá, mặc định Vàng (an toàn ở giữa, không ưu ái Xanh cũng
    // không khắt khe Đỏ) thay vì suy ra từ combinedRatePct = 0 (sẽ sai thành Xanh).
    const lane: InspectionLane = hasData ? classifyLane(stats.combinedRatePct) : "VANG";

    await prisma.$transaction([
      prisma.inspectionLaneMonthlyResult.create({
        data: { staffId: s.id, applyMonth, dataMonth, ...stats, lane },
      }),
      prisma.user.update({ where: { id: s.id }, data: { inspectionLane: lane } }),
    ]);
  }
}
