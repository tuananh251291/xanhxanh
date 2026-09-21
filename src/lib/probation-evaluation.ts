import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { generateProbationEvaluationCode } from "@/lib/codes";
import { getTrainingWeekRange, getCurrentTrainingWeek } from "@/lib/training-roadmap";

// Mẫu phiếu "Đánh giá thử việc" 9 tuần — nội dung tiêu chí CỐ ĐỊNH, khớp đúng phiếu giấy doanh nghiệp
// đang dùng (chỉ đưa vào hệ thống để chấm điểm + lưu kết quả, không đổi nội dung). KHÔNG lưu lại text
// trong DB (xem ProbationEvaluationItem) — chỉ lưu điểm số, tra nội dung theo (weekNumber, rowId) ở đây
// mỗi lần hiển thị, giống cách TRAINING_ROADMAP_WEEKS (src/lib/training-roadmap.ts) không lưu DB.
//
// 3 loại dòng:
// - MANUAL: NV cấy mô tự chấm + NV Kỹ thuật chấm ĐỘC LẬP nhau, số nguyên 0-10.
// - SPEED: điểm tự tính từ "Tốc độ trung bình của tuần" (tổng chồi tạo ra ÷ số ngày NV thật sự có nhật ký
//   cấy trong tuần, xem computeAvgSpeed) — CHUNG 1 giá trị cho cả 2 cột, không cho nhập tay.
// - CONTAMINATION: điểm tự tính từ tỉ lệ nhiễm (xem computeContaminationRate) theo bảng ngưỡng riêng —
//   CHUNG 1 giá trị cho cả 2 cột, không cho nhập tay.
export type ManualRow = { id: string; label: string; type: "MANUAL" };
export type SpeedRow = { id: string; label: string; type: "SPEED"; stage: "MAU_ME" | "THANH_PHAM"; target: number };
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
      { id: "8", label: "Đạt năng suất 650 chồi/ngày (Điểm = Tốc độ trung bình của tuần /650 *9)", type: "SPEED", stage: "MAU_ME", target: 650 },
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
      { id: "9", label: "Đạt tối thiểu 450 chồi/ngày (Điểm = Tốc độ trung bình của tuần /450 *9)", type: "SPEED", stage: "THANH_PHAM", target: 450 },
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
      { id: "6", label: "Đạt mức 450–525 chồi/ngày (Điểm = Tốc độ trung bình của tuần /488 *9)", type: "SPEED", stage: "THANH_PHAM", target: 488 },
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
      { id: "6", label: "Đạt mức 540–615 chồi/ngày (Điểm = Tốc độ trung bình của tuần /578 *9)", type: "SPEED", stage: "THANH_PHAM", target: 578 },
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
      { id: "6", label: "Đạt mức 630–705 chồi/ngày (Điểm = Tốc độ trung bình của tuần /668 *9)", type: "SPEED", stage: "THANH_PHAM", target: 668 },
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
      { id: "6", label: "Duy trì mức 725 chồi/ngày ổn định (Điểm = Tốc độ trung bình của tuần /725 *9)", type: "SPEED", stage: "THANH_PHAM", target: 725 },
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
      { id: "7", label: "Duy trì năng suất ≥725 chồi/ngày (Điểm = Tốc độ trung bình của tuần /725 *9)", type: "SPEED", stage: "THANH_PHAM", target: 725 },
      { id: "8", label: "Tỷ lệ nhiễm phòng sáng + tối ≤10% (≤8%: 10 điểm, ≤10%: 9 điểm, còn lại 0 điểm)", type: "CONTAMINATION", threshold: 10 },
      manual("9", "Có ý thức trách nhiệm và phối hợp trong công việc"),
      manual("10", "Ý thức bảo quản tài sản, thiết bị"),
    ],
  },
];

export function getWeekTemplate(week: number): ProbationEvaluationWeekTemplate | undefined {
  return PROBATION_EVALUATION_WEEKS.find((w) => w.week === week);
}

export function scoreForSpeedRow(row: SpeedRow, avgSpeed: number): number {
  return Math.max(0, Math.min(10, Math.round((avgSpeed / row.target) * 9)));
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

// Tốc độ trung bình của tuần (chồi/ngày) = tổng quantityCreated đúng `stage` trong khoảng tuần ÷ số ngày
// (recordDate, phân biệt theo ngày) NV THẬT SỰ có ít nhất 1 DailyRecord trong tuần đó (không tính riêng
// theo stage — 1 ngày có nhật ký cấy dù chỉ cấy mẫu mẹ vẫn tính là 1 ngày làm việc khi chia trung bình
// tốc độ thành phẩm, và ngược lại) — đúng quy ước anh đã chốt.
export async function computeAvgSpeed(
  staffId: string,
  stage: "MAU_ME" | "THANH_PHAM",
  weekStart: Date,
  weekEnd: Date
): Promise<number> {
  const records = await prisma.dailyRecord.findMany({
    where: { staffId, recordDate: { gte: weekStart, lte: weekEnd } },
    select: { recordDate: true, items: { select: { stage: true, quantityCreated: true } } },
  });
  const days = new Set(records.map((r) => r.recordDate.toISOString().slice(0, 10)));
  const total = records.reduce(
    (sum, r) => sum + r.items.filter((i) => i.stage === stage).reduce((s, i) => s + i.quantityCreated, 0),
    0
  );
  return days.size > 0 ? total / days.size : 0;
}

// Tỉ lệ nhiễm (%) của các lô ĐƯỢC CẤY (Lot.enteredAt = ngày nhập phòng tối) trong khoảng tuần — quy về
// đúng các phiếu "Bàn giao sản phẩm" (Phòng tối → kho sáng) của NV này có chứa ít nhất 1 lô nhập tuần đó
// (1 phiếu hầu như luôn gộp đúng 1 ngày/1 mã, xem product-handover-board.tsx, nên gần như luôn thuộc
// trọn 1 tuần). Công thức GIỮ NGUYÊN đúng cách handover-summary-report.ts/production-record-report.ts
// đang dùng: nhiễm = TransferInspectionItem.contaminatedQuantity, mẫu số = handedOverQuantity (số GỐC
// trước khi trừ nhiễm) — luồng Xanh (không qua kiểm tra) coi như không nhiễm. Phiếu còn PENDING (chưa
// xác nhận/chưa kiểm tra) bị bỏ qua hoàn toàn — chưa có kết luận nên không tính vào cả tử lẫn mẫu.
export async function computeContaminationRate(staffId: string, weekStart: Date, weekEnd: Date): Promise<number> {
  const transfers = await prisma.transfer.findMany({
    where: {
      fromUserId: staffId,
      fromRoom: { type: "PHONG_TOI" },
      status: { not: "REJECTED" },
      items: { some: { lot: { enteredAt: { gte: weekStart, lte: weekEnd } } } },
    },
    select: {
      status: true,
      items: { select: { quantity: true } },
      inspection: { select: { items: { select: { handedOverQuantity: true, contaminatedQuantity: true } } } },
    },
  });

  let handed = 0;
  let contaminated = 0;
  for (const t of transfers) {
    if (t.inspection) {
      for (const it of t.inspection.items) {
        handed += it.handedOverQuantity;
        contaminated += it.contaminatedQuantity;
      }
    } else if (t.status === "CONFIRMED") {
      for (const it of t.items) handed += it.quantity;
    }
  }
  return handed > 0 ? (contaminated / handed) * 100 : 0;
}

// Điểm tự tính (SPEED/CONTAMINATION) của 1 tuần cho 1 NV — dùng chung cho GET (xem trước lúc còn PENDING)
// và PATCH action=self (chốt số lúc NV tự chấm).
export async function computeAutoScores(
  staffId: string,
  template: ProbationEvaluationWeekTemplate,
  weekStart: Date,
  weekEnd: Date
): Promise<Record<string, number>> {
  const scores: Record<string, number> = {};
  const speedCache = new Map<string, number>();
  let contaminationRate: number | undefined;
  for (const row of template.rows) {
    if (row.type === "SPEED") {
      let avgSpeed = speedCache.get(row.stage);
      if (avgSpeed === undefined) {
        avgSpeed = await computeAvgSpeed(staffId, row.stage, weekStart, weekEnd);
        speedCache.set(row.stage, avgSpeed);
      }
      scores[row.id] = scoreForSpeedRow(row, avgSpeed);
    } else if (row.type === "CONTAMINATION") {
      if (contaminationRate === undefined) contaminationRate = await computeContaminationRate(staffId, weekStart, weekEnd);
      scores[row.id] = scoreForContaminationRow(row, contaminationRate);
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
