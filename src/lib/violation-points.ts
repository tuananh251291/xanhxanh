import { prisma } from "@/lib/prisma";
import { resolvePayrollPeriodForDate } from "@/lib/payroll-period";
import { vnDateKey, vnTimeLabel } from "@/lib/attendance";
import { ROLE_LABELS, type UserRole } from "@/types";
import { addDays } from "date-fns";

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

// Kho mô và Trợ lý cùng kiểm tra lỗi NV cấy mô — tránh 2 người ghi TRÙNG 1 lỗi cho cùng 1 NV trong cùng 1
// ngày (giờ VN): trả về lỗi đầu tiên trong `violationTypeIds` mà NGƯỜI CÒN LẠI (KHO_MO/TRO_LY khác người
// đang ghi) đã ghi cho NV đó trong ngày của `at`, kèm tên người đã ghi để báo lại. null = không trùng.
// Chính người đang ghi tự ghi lại lần 2 thì không chặn ở đây (vẫn tính x1.5 như cũ).
export async function findSameDayViolationByOtherChecker(
  staffId: string,
  violationTypeIds: string[],
  currentUserId: string,
  at: Date = new Date()
): Promise<{ violationLabel: string; checkerName: string; checkerRole: string; createdAt: Date } | null> {
  if (violationTypeIds.length === 0) return null;
  const dayStart = new Date(`${vnDateKey(at)}T00:00:00.000+07:00`);
  const record = await prisma.violationRecord.findFirst({
    where: {
      staffId,
      violationTypeId: { in: violationTypeIds },
      createdById: { not: currentUserId },
      createdBy: { role: { in: ["KHO_MO", "TRO_LY"] } },
      createdAt: { gte: dayStart, lt: addDays(dayStart, 1) },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, violationType: { select: { label: true } }, createdBy: { select: { name: true, role: true } } },
  });
  if (!record) return null;
  return {
    violationLabel: record.violationType.label,
    checkerName: record.createdBy.name,
    checkerRole: record.createdBy.role ?? "",
    createdAt: record.createdAt,
  };
}

export function sameDayViolationMessage(dup: { violationLabel: string; checkerName: string; checkerRole: string; createdAt: Date }, staffName: string): string {
  const who = `${ROLE_LABELS[dup.checkerRole as UserRole] ?? ""} ${dup.checkerName}`.trim();
  return `Lỗi "${dup.violationLabel}" của ${staffName} đã được ${who} ghi nhận hôm nay lúc ${vnTimeLabel(dup.createdAt)} — không ghi lặp lại trong cùng 1 ngày.`;
}
