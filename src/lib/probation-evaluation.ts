import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { generateProbationEvaluationCode } from "@/lib/codes";
import { getTrainingWeekRange, getCurrentTrainingWeek } from "@/lib/training-roadmap";
import { addDays } from "date-fns";

// NV cấy mô + NV kỹ thuật được làm phiếu đánh giá trong vòng 3 ngày kể từ ngày kết thúc mốc tuần (weekEnd)
// — hạn MỀM (chỉ để cảnh báo/hiện "quá hạn" ở Dashboard và danh sách, KHÔNG chặn nộp phiếu trễ), cùng quy
// ước hạn mềm đang dùng ở các việc khác của NV Kỹ thuật (VD Thứ 5 hàng tuần, xem KyThuatDashboard).
export const PROBATION_EVALUATION_GRACE_DAYS = 3;

export function isEvaluationOverdue(weekEnd: Date, now: Date = new Date()): boolean {
  return now > addDays(weekEnd, PROBATION_EVALUATION_GRACE_DAYS);
}

// Mẫu phiếu "Đánh giá thử việc" 9 tuần — nội dung tiêu chí CỐ ĐỊNH, khớp đúng phiếu giấy doanh nghiệp
// đang dùng (chỉ đưa vào hệ thống để chấm điểm + lưu kết quả, không đổi nội dung). KHÔNG lưu lại text
// trong DB (xem ProbationEvaluationItem) — chỉ lưu điểm số, tra nội dung theo (weekNumber, rowId) ở đây
// mỗi lần hiển thị, giống cách TRAINING_ROADMAP_WEEKS (src/lib/training-roadmap.ts) không lưu DB.
//
// 3 loại dòng:
// - MANUAL: NV cấy mô tự chấm + NV Kỹ thuật chấm ĐỘC LẬP nhau, số nguyên 0-10.
// - SPEED: điểm tự tính từ "Tốc độ trung bình của tuần" (tổng chồi tạo ra mọi giai đoạn ÷ số ngày NV thật sự có nhật ký
//   cấy trong tuần, xem computeAvgSpeed) — CHUNG 1 giá trị cho cả 2 cột, không cho nhập tay. Tuần không có nhật ký cấy nào
//   thì hệ thống không có số liệu: điểm để trống (null), dòng này không tính vào tổng điểm và % của phiếu.
// - CONTAMINATION: điểm tự tính từ tỉ lệ nhiễm (xem computeContaminationRate) theo bảng ngưỡng riêng —
//   CHUNG 1 giá trị cho cả 2 cột, không cho nhập tay.
export type ManualRow = { id: string; label: string; type: "MANUAL" };
export type SpeedRow = { id: string; label: string; type: "SPEED"; target: number };
export type ContaminationRow = { id: string; label: string; type: "CONTAMINATION"; threshold: 5 | 10 };
export type EvaluationRow = ManualRow | SpeedRow | ContaminationRow;
export type ProbationEvaluationWeekTemplate = { week: number; sectionTitle: string; rows: EvaluationRow[] };

const manual = (id: string, label: string): ManualRow => ({ id, label, type: "MANUAL" });

export const PROBATION_EVALUATION_WEEKS: ProbationEvaluationWeekTemplate[] = [
  {
    week: 1,
    sectionTitle: "Định hướng và an toàn phòng cấy",
    rows: [
      manual("1", "Hiểu và tuân thủ nội quy"),
      manual("2", "Thực hiện đúng quy định an toàn lao động"),
      manual("3", "Thực hiện đúng nguyên tắc vô trùng"),
      manual("4", "Thực hiện đúng kỹ thuật khử trùng tay và dụng cụ"),
      manual("5", "Nhận biết đúng mẫu sạch và mẫu nhiễm"),
      manual("6", "Cấy cây vào túi không để panh hoặc cây chạm miệng túi"),
      manual("7", "Gấp túi đúng kỹ thuật: nếp nhỏ, chặt tay"),
    ],
  },
  {
    week: 2,
    sectionTitle: "Thành thạo kỹ thuật cấy mẫu mẹ",
    rows: [
      manual("1", "Kiểm tra và lựa chọn đúng mẫu mẹ"),
      manual("2", "Thực hiện đúng toàn bộ thao tác cấy mẫu mẹ"),
      manual("3", "Không để panh, cây chạm miệng túi"),
      manual("4", "Gấp túi đúng kỹ thuật"),
      manual("5", "Khử trùng dụng cụ đúng quy định"),
      manual("6", "Không để mẫu hoặc miệng túi ra ngoài vùng vô trùng"),
      manual("7", "Không cắt đồng thời từ hai túi môi trường trở lên"),
      { id: "8", label: "Đạt năng suất 650 chồi/ngày (Điểm = Tốc độ trung bình của tuần /650 *9)", type: "SPEED", target: 650 },
      { id: "9", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 3,
    sectionTitle: "Thực hành cấy cây sản xuất đúng tiêu chuẩn",
    rows: [
      manual("1", "Phân biệt được cây sản xuất và cây PD47"),
      manual("2", "Nhận biết đúng mã cây và tiêu chuẩn cây sản xuất"),
      manual("3", "Kiểm tra và lựa chọn mẫu đạt tiêu chuẩn"),
      manual("4", "Đọc và hiểu đúng chỉ định cấy"),
      manual("5", "Xác định đúng điểm cắt của chồi"),
      manual("6", "Thực hiện đúng kỹ thuật cấy cây sản xuất"),
      manual("7", "Tuân thủ nguyên tắc vô trùng và khử trùng"),
      manual("8", "Cây sau cấy đạt tiêu chuẩn chất lượng"),
      { id: "9", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 4,
    sectionTitle: "Thành thạo cấy cây sản xuất ổn định",
    rows: [
      manual("1", "Tự thực hiện đầy đủ quy trình cấy cây sản xuất"),
      manual("2", "Không cần người hướng dẫn nhắc từng thao tác"),
      manual("3", "Kiểm tra mẫu và đọc đúng chỉ định cấy"),
      manual("4", "Xác định đúng điểm cắt"),
      manual("5", "Thực hiện đúng kỹ thuật cấy và gấp túi"),
      manual("6", "Tự chuẩn bị đầy đủ dụng cụ làm việc"),
      manual("7", "Xử lý đúng các tình huống thông thường"),
      manual("8", "Cây sau cấy đạt tiêu chuẩn chất lượng"),
      { id: "9", label: "Đạt tối thiểu 450 chồi/ngày (Điểm = Tốc độ trung bình của tuần /450 *9)", type: "SPEED", target: 450 },
      { id: "10", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 5,
    sectionTitle: "Tăng tốc giai đoạn 1",
    rows: [
      manual("1", "Duy trì đúng kỹ thuật đã học"),
      manual("2", "Duy trì đầy đủ nguyên tắc vô trùng"),
      manual("3", "Cây sau cấy đạt tiêu chuẩn chất lượng"),
      manual("4", "Không phát sinh lỗi nghiêm trọng khi tăng tốc"),
      manual("5", "Năng suất tăng đều khoảng 15 chồi/ngày"),
      { id: "6", label: "Đạt mức 450–525 chồi/ngày (Điểm = Tốc độ trung bình của tuần /488 *9)", type: "SPEED", target: 488 },
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 6,
    sectionTitle: "Tăng tốc giai đoạn 2",
    rows: [
      manual("1", "Duy trì thao tác cấy đúng quy trình kỹ thuật"),
      manual("2", "Duy trì nguyên tắc vô trùng"),
      manual("3", "Đảm bảo đúng điểm cắt và số lượng chồi theo chỉ định"),
      manual("4", "Cây sau cấy đạt tiêu chuẩn chất lượng"),
      manual("5", "Tốc độ tăng ổn định, không làm ẩu"),
      { id: "6", label: "Đạt mức 540–615 chồi/ngày (Điểm = Tốc độ trung bình của tuần /578 *9)", type: "SPEED", target: 578 },
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 7,
    sectionTitle: "Tăng tốc giai đoạn 3",
    rows: [
      manual("1", "Thao tác cấy nhanh, chính xác và ổn định"),
      manual("2", "Duy trì đúng quy trình kỹ thuật trong suốt ca làm việc"),
      manual("3", "Không để tốc độ ảnh hưởng đến vô trùng"),
      manual("4", "Không để tốc độ ảnh hưởng đến chất lượng cây"),
      manual("5", "Chủ động sắp xếp dụng cụ và thời gian làm việc"),
      { id: "6", label: "Đạt mức 630–705 chồi/ngày (Điểm = Tốc độ trung bình của tuần /668 *9)", type: "SPEED", target: 668 },
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 8,
    sectionTitle: "Đạt và duy trì năng suất mục tiêu",
    rows: [
      manual("1", "Duy trì đúng toàn bộ kỹ thuật đã được đào tạo"),
      manual("2", "Thao tác nhanh, chính xác và ổn định"),
      manual("3", "Không mắc lỗi vô trùng nghiêm trọng"),
      manual("4", "Cây sau cấy đạt tiêu chuẩn chất lượng"),
      manual("5", "Đạt năng suất tối thiểu 725 chồi/ngày"),
      { id: "6", label: "Duy trì mức 725 chồi/ngày ổn định (Điểm = Tốc độ trung bình của tuần /725 *9)", type: "SPEED", target: 725 },
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5 },
    ],
  },
  {
    week: 9,
    sectionTitle: "Đánh giá hoàn thành thử việc",
    rows: [
      manual("1", "Tuân thủ nội quy và an toàn lao động"),
      manual("2", "Tuân thủ đầy đủ nguyên tắc vô trùng"),
      manual("3", "Thành thạo, tuân thủ quy trình cấy cây sản xuất"),
      manual("4", "Tự thực hiện công việc không cần kèm từng thao tác"),
      manual("5", "Đọc hiểu đúng mã cây và chỉ định cấy"),
      manual("6", "Cây sau cấy đạt tiêu chuẩn chất lượng theo chỉ định cấy"),
      { id: "7", label: "Duy trì năng suất ≥725 chồi/ngày (Điểm = Tốc độ trung bình của tuần /725 *9)", type: "SPEED", target: 725 },
      { id: "8", label: "Tỷ lệ nhiễm phòng sáng + tối ≤10% (≤8%: 10 điểm, ≤10%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 10 },
      manual("9", "Có ý thức trách nhiệm và phối hợp trong công việc"),
      manual("10", "Ý thức bảo quản tài sản, thiết bị"),
    ],
  },
];

// Lần đánh giá cuối của lộ trình thử việc — chỉ phiếu này được in (kèm tổng hợp các tuần trước).
export function isFinalProbationWeek(week: number): boolean {
  return week === PROBATION_EVALUATION_WEEKS.length;
}

export function getWeekTemplate(week: number): ProbationEvaluationWeekTemplate | undefined {
  return PROBATION_EVALUATION_WEEKS.find((w) => w.week === week);
}

export function scoreForSpeedRow(row: SpeedRow, avgSpeed: number): number {
  return Math.max(0, Math.min(10, Math.round((avgSpeed / row.target) * 9)));
}

// % của phiếu chỉ tính trên các dòng có điểm — dòng để trống (tuần không có nhật ký cấy) không kéo % xuống.
export function evaluationPercent(scores: (number | null)[]): number {
  const counted = scores.filter((s): s is number => s !== null);
  if (counted.length === 0) return 0;
  return Math.round((counted.reduce((a, b) => a + b, 0) / (counted.length * 10)) * 1000) / 10;
}

export function evaluationResult(percent: number): "DAT" | "CAN_CAI_THIEN" | "KHONG_DAT" {
  return percent < 70 ? "KHONG_DAT" : percent < 90 ? "CAN_CAI_THIEN" : "DAT";
}

export function scoreForContaminationRow(row: ContaminationRow, ratePct: number): number {
  if (row.threshold === 5) {
    if (ratePct <= 3) return 10;
    if (ratePct <= 5) return 9;
    return 0;
  }
  if (ratePct <= 8) return 10;
  if (ratePct <= 10) return 9;
  return 0;
}

// weekEnd lưu kiểu @db.Date (00:00 ngày cuối tuần) còn recordDate/enteredAt có giờ — so `lte weekEnd` sẽ
// bỏ sót gần trọn ngày cuối, nên luôn so `lt` 00:00 ngày kế tiếp.
function endOfWeekExclusive(weekEnd: Date): Date {
  return addDays(weekEnd, 1);
}

// Tốc độ trung bình của tuần (chồi/ngày) = tổng quantityCreated của MỌI giai đoạn (mẫu mẹ + thành phẩm —
// NV thử việc tuần nào cũng có thể được giao cấy mẫu mẹ, chỉ đếm thành phẩm thì ra 0 oan) trong khoảng tuần
// ÷ số ngày (recordDate, phân biệt theo ngày) NV THẬT SỰ có ít nhất 1 DailyRecord trong tuần đó.
export type SpeedStats = { total: number; days: number; avgSpeed: number };

export async function computeSpeedStats(staffId: string, weekStart: Date, weekEnd: Date): Promise<SpeedStats> {
  const records = await prisma.dailyRecord.findMany({
    where: { staffId, recordDate: { gte: weekStart, lt: endOfWeekExclusive(weekEnd) } },
    select: { recordDate: true, items: { select: { quantityCreated: true } } },
  });
  const days = new Set(records.map((r) => r.recordDate.toISOString().slice(0, 10)));
  const total = records.reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantityCreated, 0), 0);
  return { total, days: days.size, avgSpeed: days.size > 0 ? total / days.size : 0 };
}

export async function computeAvgSpeed(staffId: string, weekStart: Date, weekEnd: Date): Promise<number> {
  return (await computeSpeedStats(staffId, weekStart, weekEnd)).avgSpeed;
}

// Diễn giải điểm tốc độ bằng số thật của tuần, VD: "Cấy 3.500 chồi trong 5 ngày thì tốc độ là 700 chồi/ngày, điểm = 700 ÷ 725 × 9 = 8,69, làm tròn thành 9 điểm."
export function speedScoreNote(row: SpeedRow, stats: SpeedStats): string {
  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  if (stats.days === 0) return "Tuần này chưa có nhật ký cấy trên hệ thống nên mục này không tính điểm.";
  const raw = (stats.avgSpeed / row.target) * 9;
  const score = scoreForSpeedRow(row, stats.avgSpeed);
  const ending = raw > 10 ? `vượt mức tối đa nên được ${score} điểm` : raw === score ? `được ${score} điểm` : `làm tròn thành ${score} điểm`;
  return `Cấy ${fmt(stats.total)} chồi trong ${stats.days} ngày thì tốc độ là ${fmt(stats.avgSpeed)} chồi/ngày, điểm = ${fmt(stats.avgSpeed)} ÷ ${row.target} × 9 = ${fmt(raw)}, ${ending}.`;
}

// Tỉ lệ nhiễm (%) của các lô ĐƯỢC CẤY (Lot.enteredAt = ngày nhập phòng tối) trong khoảng tuần — quy về
// đúng các phiếu "Bàn giao sản phẩm" (Phòng tối → kho sáng) của NV này có chứa ít nhất 1 lô nhập tuần đó
// (1 phiếu hầu như luôn gộp đúng 1 ngày/1 mã, xem product-handover-board.tsx, nên gần như luôn thuộc
// trọn 1 tuần). Công thức GIỮ NGUYÊN đúng cách handover-summary-report.ts/production-record-report.ts
// đang dùng: nhiễm = TransferInspectionItem.contaminatedQuantity, mẫu số = handedOverQuantity (số GỐC
// trước khi trừ nhiễm) — luồng Xanh (không qua kiểm tra) coi như không nhiễm. Phiếu còn PENDING (chưa
// xác nhận/chưa kiểm tra) bị bỏ qua hoàn toàn — chưa có kết luận nên không tính vào cả tử lẫn mẫu.
// Từng phiếu bàn giao góp vào tỉ lệ nhiễm — để diễn giải số nhiễm lấy từ đâu.
export type ContaminationTransfer = { code: string; kind: "INSPECTED" | "NO_INSPECTION" | "PENDING"; handed: number; contaminated: number };
export type ContaminationStats = { transfers: number; handed: number; contaminated: number; ratePct: number; details: ContaminationTransfer[] };

export async function computeContaminationStats(staffId: string, weekStart: Date, weekEnd: Date): Promise<ContaminationStats> {
  const transfers = await prisma.transfer.findMany({
    where: {
      fromUserId: staffId,
      fromRoom: { type: "PHONG_TOI" },
      status: { not: "REJECTED" },
      items: { some: { lot: { enteredAt: { gte: weekStart, lt: endOfWeekExclusive(weekEnd) } } } },
    },
    orderBy: { createdAt: "asc" },
    select: {
      code: true,
      status: true,
      items: { select: { quantity: true } },
      inspection: { select: { items: { select: { handedOverQuantity: true, contaminatedQuantity: true } } } },
    },
  });

  let handed = 0;
  let contaminated = 0;
  const details: ContaminationTransfer[] = [];
  for (const t of transfers) {
    if (t.inspection) {
      const h = t.inspection.items.reduce((s, it) => s + it.handedOverQuantity, 0);
      const c = t.inspection.items.reduce((s, it) => s + it.contaminatedQuantity, 0);
      handed += h;
      contaminated += c;
      details.push({ code: t.code, kind: "INSPECTED", handed: h, contaminated: c });
    } else if (t.status === "CONFIRMED") {
      const h = t.items.reduce((s, it) => s + it.quantity, 0);
      handed += h;
      details.push({ code: t.code, kind: "NO_INSPECTION", handed: h, contaminated: 0 });
    } else {
      details.push({ code: t.code, kind: "PENDING", handed: t.items.reduce((s, it) => s + it.quantity, 0), contaminated: 0 });
    }
  }
  return { transfers: transfers.length, handed, contaminated, ratePct: handed > 0 ? (contaminated / handed) * 100 : 0, details };
}

export async function computeContaminationRate(staffId: string, weekStart: Date, weekEnd: Date): Promise<number> {
  return (await computeContaminationStats(staffId, weekStart, weekEnd)).ratePct;
}

const CONTAMINATION_NOTE_MAX_TRANSFERS = 8;

// Diễn giải điểm tỉ lệ nhiễm bằng số thật của tuần (nhiều dòng, nối bằng xuống dòng): số nhiễm của từng phiếu bàn giao → tỉ lệ % → điểm.
export function contaminationScoreNote(row: ContaminationRow, stats: ContaminationStats): string {
  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const score = scoreForContaminationRow(row, stats.ratePct);
  const [hi, mid] = row.threshold === 5 ? [3, 5] : [8, 10];
  const band = stats.ratePct <= hi ? `≤${hi}%` : stats.ratePct <= mid ? `≤${mid}%` : `trên ${mid}%`;
  const scale = `(≤${hi}%: 10 điểm, ≤${mid}%: 9 điểm, trên ${mid}%: 0 điểm)`;
  if (stats.details.length === 0) {
    return `Chưa có phiếu bàn giao Phòng tối → kho sáng nào của các lô cấy tuần này nên tỉ lệ nhiễm tính là 0%, được ${score} điểm ${scale}.`;
  }
  const lines = ["Số nhiễm lấy từ phiếu bàn giao Phòng tối → kho sáng của các lô cấy tuần này:"];
  for (const d of stats.details.slice(0, CONTAMINATION_NOTE_MAX_TRANSFERS)) {
    lines.push(
      d.kind === "INSPECTED" ? `• ${d.code}: bàn giao ${fmt(d.handed)} cây, nhiễm ${fmt(d.contaminated)} cây (Kho mô kiểm tra)`
        : d.kind === "NO_INSPECTION" ? `• ${d.code}: bàn giao ${fmt(d.handed)} cây, không qua kiểm tra nên tính nhiễm 0 cây`
          : `• ${d.code}: ${fmt(d.handed)} cây, chưa xác nhận nên chưa tính`
    );
  }
  const more = stats.details.length - CONTAMINATION_NOTE_MAX_TRANSFERS;
  if (more > 0) lines.push(`• … và ${more} phiếu khác`);
  if (stats.handed === 0) {
    lines.push(`Chưa có phiếu nào được xác nhận nên tỉ lệ nhiễm tính là 0%, được ${score} điểm ${scale}.`);
  } else {
    lines.push(`Tỉ lệ nhiễm = ${fmt(stats.contaminated)} ÷ ${fmt(stats.handed)} = ${fmt(stats.ratePct)}%, ${band} nên được ${score} điểm ${scale}.`);
  }
  return lines.join("\n");
}

// Điểm tự tính (SPEED/CONTAMINATION) của 1 tuần cho 1 NV — dùng chung cho GET (xem trước lúc còn PENDING)
// và PATCH action=self (chốt số lúc NV tự chấm).
export async function computeAutoScores(
  staffId: string,
  template: ProbationEvaluationWeekTemplate,
  weekStart: Date,
  weekEnd: Date
): Promise<Record<string, number | null>> {
  const scores: Record<string, number | null> = {};
  let speed: SpeedStats | undefined;
  let contamination: ContaminationStats | undefined;
  for (const row of template.rows) {
    if (row.type === "SPEED") {
      if (speed === undefined) speed = await computeSpeedStats(staffId, weekStart, weekEnd);
      scores[row.id] = speed.days > 0 ? scoreForSpeedRow(row, speed.avgSpeed) : null;
    } else if (row.type === "CONTAMINATION") {
      if (contamination === undefined) contamination = await computeContaminationStats(staffId, weekStart, weekEnd);
      scores[row.id] = scoreForContaminationRow(row, contamination.ratePct);
    }
  }
  return scores;
}

// Tự sinh (lazy, gọi khi CAY_MO thử việc tải trang — xem (dashboard)/layout.tsx) mọi tuần ĐÃ KẾT THÚC mà
// NV này chưa có ProbationEvaluation — mỗi tuần 7 ngày tính từ probationStartDate, dùng lại đúng
// getTrainingWeekRange/getCurrentTrainingWeek đã có ở training-roadmap.ts để khớp đúng tuần NV đang thấy
// ở trang Lộ trình đào tạo.
export async function ensureWeeklyProbationEvaluations(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, code: true, employmentType: true, probationStartDate: true },
  });
  if (!user || user.employmentType !== "THU_VIEC" || !user.probationStartDate) return;

  const totalWeeks = PROBATION_EVALUATION_WEEKS.length;
  const currentWeek = getCurrentTrainingWeek(user.probationStartDate, totalWeeks);
  // null = chưa tới ngày bắt đầu, hoặc đã qua hết lộ trình (currentWeek trả null luôn > totalWeeks) — vẫn
  // cần xét đủ tới tuần cuối cùng đã ĐI QUA (kể cả sau khi hoàn thành lộ trình, tuần 9 vẫn cần được tạo).
  const now = new Date();
  const lastWeekToCheck = currentWeek ?? totalWeeks;

  for (let week = 1; week <= lastWeekToCheck; week++) {
    const range = getTrainingWeekRange(user.probationStartDate, week);
    if (range.end >= now) continue; // tuần chưa kết thúc — chưa tới lúc tự chấm

    const existing = await prisma.probationEvaluation.findUnique({
      where: { staffId_weekNumber: { staffId: user.id, weekNumber: week } },
      select: { id: true },
    });
    if (existing) continue;

    const created = await prisma.probationEvaluation.create({
      data: {
        code: generateProbationEvaluationCode(user.code, week),
        staffId: user.id,
        weekNumber: week,
        weekStart: range.start,
        weekEnd: range.end,
      },
      select: { id: true, code: true },
    });
    await createAlert({
      type: "PROBATION_EVALUATION_SELF_DUE",
      title: "Đến hạn tự đánh giá tuần thử việc",
      message: `Tuần ${week} đã kết thúc — vào "Đánh giá thử việc" để tự chấm điểm (phiếu ${created.code}).`,
      userId: user.id,
      relatedId: created.id,
      relatedType: "ProbationEvaluation",
    });
  }
}
