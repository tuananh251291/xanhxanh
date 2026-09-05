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
//   A = trung bình cộng tỉ lệ nhiễm của TỪNG NGÀY CÓ PHÁT HIỆN NHIỄM trong tháng (KHÔNG chia cho tổng số
//       ngày sản xuất — ngày nào 0% nhiễm thì KHÔNG tính vào mẫu số trung bình, chỉ ngày nào có nhiễm mới
//       được cộng vào rồi chia đúng cho số ngày đó). 1 "ngày sản xuất" = 1 LotInspection (đúng 1 lần NV tự
//       kiểm tra, gộp mọi quy cách M05/T01/T05 sinh ra trong 1 lần nhập số liệu cấy, xem comment model
//       LotInspection). Tỉ lệ của 1 ngày có phát hiện nhiễm =
//         (số lượng NV cấy mô tự lọc ra nhiễm trước khi bàn giao [LotInspectionItem.contaminatedQuantity]
//          + số lượng Kho mô phát hiện THÊM lúc nhận bàn giao [TransferInspectionItem.contaminatedQuantity,
//            khớp qua lotId → TransferItem → Transfer.inspection, theo stageCode — CHỈ có với luồng
//            Vàng/Đỏ/chưa có dữ liệu, luồng Xanh không bị kiểm tra lại nên phần này luôn = 0])
//         / tổng số lượng SẢN XUẤT RA của đúng ngày đó [LotInspection.totalQuantity].
//       Phần tự kiểm tra là số NV cấy mô tự nhập — có sẵn cho MỌI luồng, không sợ "Xanh mãi không ai kiểm
//       tra" vì phần đó vẫn có; chỉ riêng phần "Kho mô phát hiện thêm" là 0 với luồng Xanh (không kiểm lại).
//       Tháng có sản xuất nhưng KHÔNG ngày nào phát hiện nhiễm → A = 0% (thành tích tốt, KHÔNG phải thiếu
//       dữ liệu) — chỉ coi là "thiếu dữ liệu" khi tháng đó NV không hề có ngày sản xuất nào.
//   B = trung bình cộng tỉ lệ nhiễm của TỪNG CHỈ ĐỊNH CẤY (không tính chỉ định dự phòng — isBackup, và
//       không tính Chỉ định cấy xử lý vì đó là model RepackInstruction riêng) có weekStart trong tháng,
//       gán cho đúng NV này — tỉ lệ 1 chỉ định = tổng DailyRecord.motherContaminatedM05 / inputMotherQuantity
//       của chỉ định đó (cùng công thức /api/reports/mother-contamination) — cũng là số NV tự nhập hàng
//       ngày, không phụ thuộc luồng.
//
// Cả A và B đều lấy trung bình CỘNG các tỉ lệ (không lấy tổng nhiễm/tổng số rồi chia 1 lần) — 1 ngày/1
// chỉ định nhỏ vẫn có trọng số ngang 1 ngày/1 chỉ định lớn, đúng theo ví dụ Admin đưa ra.

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

// A — xem giải thích ở đầu file. `dataMonthStart`/`dataMonthEnd` là 1 tháng dương lịch trọn vẹn. 1 "ngày
// sản xuất" = 1 LotInspection (staffId = đúng NV này, createdAt trong tháng). `hadProductionData` = có ít
// nhất 1 ngày sản xuất hợp lệ trong tháng hay không — TÁCH RIÊNG khỏi sampleCount (số ngày CÓ nhiễm) vì
// sampleCount = 0 có thể là "không có ngày nào sản xuất" (thiếu dữ liệu) HOẶC "có sản xuất nhưng không
// ngày nào nhiễm" (A = 0% hợp lệ) — 2 trường hợp cần phân biệt để không mặc định nhầm Vàng.
async function computeDarkRoomRate(
  staffId: string,
  dataMonthStart: Date,
  dataMonthEnd: Date
): Promise<{ ratePct: number; sampleCount: number; hadProductionData: boolean }> {
  const inspections = await prisma.lotInspection.findMany({
    where: { staffId, createdAt: { gte: dataMonthStart, lte: dataMonthEnd } },
    select: {
      totalQuantity: true,
      items: {
        select: {
          lotId: true,
          stageCode: true,
          contaminatedQuantity: true,
          lot: { select: { instruction: { select: { isBackup: true } } } },
        },
      },
    },
  });
  if (inspections.length === 0) return { ratePct: 0, sampleCount: 0, hadProductionData: false };

  // Kho mô phát hiện THÊM lúc nhận bàn giao — khớp qua lotId → TransferItem → Transfer.inspection, theo
  // stageCode (cùng cách khớp đã dùng ở /api/reports/dark-room-contamination) — CHỈ có dữ liệu với
  // luồng Vàng/Đỏ/chưa có dữ liệu (luồng Xanh không bị Kho mô kiểm tra lại nên không có TransferInspection).
  const allLotIds = Array.from(new Set(inspections.flatMap((i) => i.items.map((it) => it.lotId))));
  const transferItems = allLotIds.length
    ? await prisma.transferItem.findMany({
        where: { lotId: { in: allLotIds } },
        select: { lotId: true, transfer: { select: { inspection: { select: { items: { select: { stageCode: true, contaminatedQuantity: true } } } } } } },
      })
    : [];
  const redFlowItemsByLotId = new Map(transferItems.map((ti) => [ti.lotId, ti.transfer.inspection?.items ?? null]));

  const rates: number[] = [];
  let hadProductionData = false;
  for (const insp of inspections) {
    // Bỏ hẳn ngày nào TOÀN BỘ là lô từ chỉ định dự phòng — xem lưu ý ở đầu file. Thực tế 1 NV chỉ làm 1
    // chỉ định/ngày nên hiếm khi có ngày trộn lẫn dự phòng + chỉ định thường.
    if (insp.items.every((it) => it.lot.instruction?.isBackup)) continue;
    if (insp.totalQuantity <= 0) continue;
    hadProductionData = true;

    let selfContaminated = 0;
    let khoMoAdditional = 0;
    for (const item of insp.items) {
      if (item.lot.instruction?.isBackup) continue;
      selfContaminated += item.contaminatedQuantity;
      const redFlowItems = redFlowItemsByLotId.get(item.lotId);
      const matches = redFlowItems?.filter((r) => r.stageCode === item.stageCode) ?? [];
      for (const m of matches) khoMoAdditional += m.contaminatedQuantity;
    }
    // Chỉ đưa vào mẫu số trung bình những ngày THỰC SỰ có nhiễm — ngày 0% nhiễm không kéo tụt trung bình
    // xuống (không tính là 1 "mẫu" 0%), theo đúng yêu cầu chỉ chia cho số ngày phát hiện nhiễm.
    const numerator = selfContaminated + khoMoAdditional;
    if (numerator > 0) rates.push((numerator / insp.totalQuantity) * 100);
  }
  if (rates.length === 0) return { ratePct: 0, sampleCount: 0, hadProductionData };
  return { ratePct: rates.reduce((s, r) => s + r, 0) / rates.length, sampleCount: rates.length, hadProductionData };
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
    // darkRoom.sampleCount = 0 KHÔNG có nghĩa là thiếu dữ liệu (có thể là tháng sạch, không ngày nào
    // nhiễm) — phải xét hadProductionData riêng, xem computeDarkRoomRate.
    hasData: darkRoom.hadProductionData || brightRoom.sampleCount > 0,
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
