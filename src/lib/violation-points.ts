import { prisma } from "@/lib/prisma";
import { resolvePayrollPeriodForDate } from "@/lib/payroll-period";

// Điểm ÁP DỤNG cho 1 lỗi vi phạm SẮP ghi cho 1 NV cấy mô — lần đầu trong kỳ lương (tính theo thời điểm
// ghi nhận `at`) của ĐÚNG loại lỗi đó, ĐÚNG NV đó = điểm cơ bản; từ lần thứ 2 trở đi trong CÙNG kỳ =
// điểm cơ bản × 1.5 (làm tròn), theo đúng quy định tính lương. Dùng chung cho cả luồng "Kiểm tra kho
// tối" (dark-room-inspection) lẫn ghi nhận vi phạm trực tiếp (violation-types).
export async function computeViolationPointsApplied(
  staffId: string,
  violationTypeId: string,
  basePoints: number,
  at: Date = new Date()
): Promise<number> {
  const { rangeStart, rangeEnd } = resolvePayrollPeriodForDate(at);
  const priorCount = await prisma.violationRecord.count({
    where: { staffId, violationTypeId, createdAt: { gte: rangeStart, lt: rangeEnd } },
  });
  return priorCount > 0 ? Math.round(basePoints * 1.5) : basePoints;
}
