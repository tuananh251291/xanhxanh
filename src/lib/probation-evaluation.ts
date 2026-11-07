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
// - CONTAMINATION: điểm tự tính từ tỉ lệ nhiễm (xem computeRowContaminationStats) theo bảng ngưỡng riêng —
//   CHUNG 1 giá trị cho cả 2 cột, không cho nhập tay. Không có số liệu thì để trống (null), không tính điểm như SPEED.
export type ManualRow = { id: string; label: string; type: "MANUAL" };
export type SpeedRow = { id: string; label: string; type: "SPEED"; target: number };
// source: DARK_ROOM = nhiễm sau ủ tối; DARK_AND_MOTHER = phòng tối (nhiễm sau ủ tối) + phòng sáng (nhiễm mẫu mẹ), xem computeRowContaminationStats.
export type ContaminationRow = { id: string; label: string; type: "CONTAMINATION"; threshold: 5 | 10; source: "DARK_ROOM" | "DARK_AND_MOTHER" };
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
      { id: "9", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "9", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "10", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "7", label: "Tỷ lệ nhiễm sau 7 ngày ≤5% (≤3%: 10 điểm, ≤5%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 5, source: "DARK_ROOM" },
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
      { id: "8", label: "Tỷ lệ nhiễm phòng sáng + tối ≤10% (≤8%: 10 điểm, ≤10%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 10, source: "DARK_AND_MOTHER" },
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

// Tỉ lệ nhiễm của mục đánh giá gồm 1 hoặc 2 phần, mỗi phần = tổng nhiễm ÷ tổng số kiểm tra trong tuần:
// - Phòng tối (nhiễm sau ủ tối): NV cấy mô tự kiểm tra lô khi đủ ngày ủ tối (LotInspection), theo NGÀY KIỂM TRA — cùng cách trang
//   Báo cáo cá nhân và báo cáo "Nhiễm sau ủ tối" đang tính. Không cộng phần Kho mô phát hiện thêm lúc nhận bàn giao.
// - Phòng sáng (nhiễm mẫu mẹ): "MM nhiễm" ÷ "MM đã kiểm tra" NV ghi trong nhật ký cấy (DailyRecord) của tuần.
// Mục "phòng sáng + tối" (tuần 9) = tỉ lệ phòng tối + tỉ lệ phòng sáng, tính riêng rồi cộng (cùng cách luồng kiểm tra,
// xem inspection-lane.ts). Phần không có số liệu tính 0%; cả mục không có số liệu nào thì để trống, không tính điểm.
export type ContaminationLine = { label: string; checked: number; contaminated: number };
export type ContaminationPart = {
  kind: "DARK_ROOM" | "MOTHER"; lines: ContaminationLine[]; checked: number; contaminated: number; ratePct: number;
};
export type ContaminationStats = { parts: ContaminationPart[]; ratePct: number; hasData: boolean };

const dayMonth = (d: Date) => {
  const v = new Date(d.getTime() + 7 * 3600000);
  return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}`;
};

function toPart(kind: ContaminationPart["kind"], lines: ContaminationLine[]): ContaminationPart {
  const checked = lines.reduce((s, l) => s + l.checked, 0);
  const contaminated = lines.reduce((s, l) => s + l.contaminated, 0);
  return { kind, lines, checked, contaminated, ratePct: checked > 0 ? (contaminated / checked) * 100 : 0 };
}

async function darkRoomPart(staffId: string, weekStart: Date, weekEnd: Date): Promise<ContaminationPart> {
  const inspections = await prisma.lotInspection.findMany({
    where: { staffId, createdAt: { gte: weekStart, lt: endOfWeekExclusive(weekEnd) } },
    orderBy: { createdAt: "asc" },
    select: { code: true, createdAt: true, items: { select: { initialQuantity: true, contaminatedQuantity: true } } },
  });
  return toPart("DARK_ROOM", inspections.map((i) => ({
    label: `${dayMonth(i.createdAt)} – lô ${i.code}`,
    checked: i.items.reduce((s, it) => s + it.initialQuantity, 0),
    contaminated: i.items.reduce((s, it) => s + it.contaminatedQuantity, 0),
  })));
}

async function motherPart(staffId: string, weekStart: Date, weekEnd: Date): Promise<ContaminationPart> {
  const records = await prisma.dailyRecord.findMany({
    where: { staffId, recordDate: { gte: weekStart, lt: endOfWeekExclusive(weekEnd) }, motherChecked: { gt: 0 } },
    orderBy: { recordDate: "asc" },
    select: { recordDate: true, motherChecked: true, motherContaminatedM05: true, instruction: { select: { code: true } } },
  });
  return toPart("MOTHER", records.map((r) => ({
    label: `${dayMonth(r.recordDate)} – chỉ định ${r.instruction.code}`,
    checked: r.motherChecked,
    contaminated: r.motherContaminatedM05,
  })));
}

export async function computeRowContaminationStats(row: ContaminationRow, staffId: string, weekStart: Date, weekEnd: Date): Promise<ContaminationStats> {
  const parts = row.source === "DARK_ROOM"
    ? [await darkRoomPart(staffId, weekStart, weekEnd)]
    : [await darkRoomPart(staffId, weekStart, weekEnd), await motherPart(staffId, weekStart, weekEnd)];
  return { parts, ratePct: parts.reduce((s, p) => s + p.ratePct, 0), hasData: parts.some((p) => p.checked > 0) };
}

export function contaminationRowScore(row: ContaminationRow, stats: ContaminationStats): number | null {
  return stats.hasData ? scoreForContaminationRow(row, stats.ratePct) : null;
}

const CONTAMINATION_NOTE_MAX_LINES = 8;

// Diễn giải điểm tỉ lệ nhiễm bằng số thật của tuần (nhiều dòng): số nhiễm từng lần kiểm tra → tỉ lệ % → điểm.
export function contaminationScoreNote(row: ContaminationRow, stats: ContaminationStats): string {
  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  const [hi, mid] = row.threshold === 5 ? [3, 5] : [8, 10];
  const scale = `(≤${hi}%: 10 điểm, ≤${mid}%: 9 điểm, trên ${mid}%: 0 điểm)`;
  if (!stats.hasData) {
    return row.source === "DARK_ROOM"
      ? "Tuần này NV chưa có lần tự kiểm tra nhiễm sau ủ tối nào trên hệ thống nên mục này không tính điểm."
      : "Tuần này chưa có số liệu kiểm tra nhiễm sau ủ tối và nhiễm mẫu mẹ trên hệ thống nên mục này không tính điểm.";
  }
  const score = scoreForContaminationRow(row, stats.ratePct);
  const band = stats.ratePct <= hi ? `≤${hi}%` : stats.ratePct <= mid ? `≤${mid}%` : `trên ${mid}%`;
  const out: string[] = [];
  for (const p of stats.parts) {
    out.push(p.kind === "DARK_ROOM"
      ? (stats.parts.length > 1 ? "Phòng tối – nhiễm sau ủ tối (NV tự kiểm tra lô sau ủ tối):" : "Số nhiễm lấy từ các lần NV tự kiểm tra lô sau ủ tối trong tuần:")
      : "Phòng sáng – nhiễm mẫu mẹ NV ghi khi cấy:");
    if (p.checked === 0) { out.push("• Chưa có số liệu, tính 0%"); continue; }
    const unit = p.kind === "DARK_ROOM" ? "cây" : "mẫu mẹ";
    for (const l of p.lines.slice(0, CONTAMINATION_NOTE_MAX_LINES)) {
      out.push(`• ${l.label}: kiểm tra ${fmt(l.checked)} ${unit}, nhiễm ${fmt(l.contaminated)} ${unit}`);
    }
    const more = p.lines.length - CONTAMINATION_NOTE_MAX_LINES;
    if (more > 0) out.push(`• … và ${more} dòng khác`);
    if (stats.parts.length > 1) out.push(`→ ${fmt(p.contaminated)} ÷ ${fmt(p.checked)} = ${fmt(p.ratePct)}%`);
  }
  const formula = stats.parts.length > 1
    ? `Tỉ lệ nhiễm phòng sáng + tối = ${[...stats.parts].reverse().map((p) => `${fmt(p.ratePct)}%`).join(" + ")} = ${fmt(stats.ratePct)}%`
    : `Tỉ lệ nhiễm = ${fmt(stats.parts[0].contaminated)} ÷ ${fmt(stats.parts[0].checked)} = ${fmt(stats.ratePct)}%`;
  out.push(`${formula}, ${band} nên được ${score} điểm ${scale}.`);
  return out.join("\n");
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
  const contamination = new Map<string, ContaminationStats>();
  for (const row of template.rows) {
    if (row.type === "SPEED") {
      if (speed === undefined) speed = await computeSpeedStats(staffId, weekStart, weekEnd);
      scores[row.id] = speed.days > 0 ? scoreForSpeedRow(row, speed.avgSpeed) : null;
    } else if (row.type === "CONTAMINATION") {
      if (!contamination.has(row.source)) contamination.set(row.source, await computeRowContaminationStats(row, staffId, weekStart, weekEnd));
      scores[row.id] = contaminationRowScore(row, contamination.get(row.source)!);
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
