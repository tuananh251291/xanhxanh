import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { canManagePayroll } from "@/types";
import {
  ATTENDANCE_ROLES,
  DEFAULT_ANNUAL_LEAVE_DAYS,
  buildAttendanceDays,
  dateKeysBetween,
  toAttendanceWorkDate,
  vnDateKey,
  type AttendanceDayCell,
  type AttendanceSummary,
} from "@/lib/attendance";

// Phạm vi ngày của 1 tháng "yyyy-MM" (theo lịch, không theo kỳ lương).
export function monthRange(month: string): { startKey: string; endKey: string; dateKeys: string[] } {
  const [y, m] = month.split("-").map(Number);
  const startKey = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const endKey = `${month}-${String(last).padStart(2, "0")}`;
  return { startKey, endKey, dateKeys: dateKeysBetween(startKey, endKey) };
}

export const MONTH_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function loadHolidayKeys(startKey: string, endKey: string): Promise<Set<string>> {
  // PublicHoliday.date lưu từ input date ("yyyy-MM-dd" → UTC-midnight) — so khớp bằng phần ngày ISO.
  const rows = await prisma.publicHoliday.findMany({
    where: { date: { gte: toAttendanceWorkDate(startKey), lte: new Date(toAttendanceWorkDate(endKey).getTime() + 86_399_999) } },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}

// NV + khu làm việc + cài đặt chấm công của khu (đọc DB, không tin session vì JWT có thể cũ).
export async function getStaffAttendanceContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, code: true, role: true,
      workplaceWarehouse: { select: { id: true, name: true, attendanceSite: true } },
    },
  });
  return user;
}

// Người dùng có quyền duyệt cấp 1 cho khu nào.
export async function getApproverWarehouseIds(userId: string): Promise<string[]> {
  const sites = await prisma.attendanceSite.findMany({ where: { approverId: userId }, select: { warehouseId: true } });
  return sites.map((s) => s.warehouseId);
}

export function isAttendanceHr(role: UserRole | null | undefined): boolean {
  return canManagePayroll(role);
}

// Người duyệt cấp 1 của khu — null nếu chưa gán hoặc chính là người gửi đơn (khi đó lên thẳng HCNS).
export async function resolveManagerApprover(warehouseId: string | null, requesterId: string): Promise<string | null> {
  if (!warehouseId) return null;
  const site = await prisma.attendanceSite.findUnique({ where: { warehouseId }, select: { approverId: true } });
  if (!site?.approverId || site.approverId === requesterId) return null;
  const approver = await prisma.user.findUnique({ where: { id: site.approverId }, select: { isActive: true } });
  return approver?.isActive ? site.approverId : null;
}

// Số ngày phép năm đã dùng (đơn ANNUAL_LEAVE đã duyệt hoặc đang chờ duyệt, tính theo năm của ngày bắt đầu).
export async function getAnnualLeaveUsage(userId: string, year: number) {
  const [balance, requests] = await Promise.all([
    prisma.annualLeaveBalance.findUnique({ where: { userId_year: { userId, year } }, select: { totalDays: true } }),
    prisma.attendanceRequest.findMany({
      where: {
        userId,
        type: "ANNUAL_LEAVE",
        status: { in: ["APPROVED", "PENDING_MANAGER", "PENDING_HR"] },
        startDate: { gte: toAttendanceWorkDate(`${year}-01-01`), lte: toAttendanceWorkDate(`${year}-12-31`) },
      },
      select: { status: true, leaveDays: true },
    }),
  ]);
  const total = balance?.totalDays ?? DEFAULT_ANNUAL_LEAVE_DAYS;
  const used = requests.filter((r) => r.status === "APPROVED").reduce((s, r) => s + r.leaveDays, 0);
  const pending = requests.filter((r) => r.status !== "APPROVED").reduce((s, r) => s + r.leaveDays, 0);
  return { total, used, pending, remaining: total - used - pending };
}

export type TimesheetRow = {
  userId: string;
  name: string;
  code: string;
  role: UserRole | null;
  warehouseId: string | null;
  warehouseName: string | null;
  days: AttendanceDayCell[];
  summary: AttendanceSummary;
};

// Bảng công tháng của nhiều NV (lọc theo khu nếu có, hoặc theo danh sách userIds).
export async function buildMonthlyTimesheet(params: { month: string; warehouseId?: string | null; userIds?: string[] }): Promise<{
  dateKeys: string[];
  holidayKeys: string[];
  rows: TimesheetRow[];
}> {
  const { month, warehouseId, userIds } = params;
  const { startKey, endKey, dateKeys } = monthRange(month);
  const todayKey = vnDateKey(new Date());
  const start = toAttendanceWorkDate(startKey);
  const end = toAttendanceWorkDate(endKey);

  const staff = await prisma.user.findMany({
    where: {
      role: { in: ATTENDANCE_ROLES },
      ...(userIds ? { id: { in: userIds } } : { isActive: true }),
      ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}),
    },
    select: {
      id: true, name: true, code: true, role: true,
      workplaceWarehouse: { select: { id: true, name: true, attendanceSite: { select: { shiftStart: true, shiftEnd: true, graceMinutes: true } } } },
    },
    orderBy: [{ workplaceWarehouseId: "asc" }, { name: "asc" }],
  });
  const ids = staff.map((s) => s.id);

  const [holidayKeys, records, requests] = await Promise.all([
    loadHolidayKeys(startKey, endKey),
    prisma.attendanceRecord.findMany({
      where: { userId: { in: ids }, workDate: { gte: start, lte: end } },
      select: { id: true, userId: true, workDate: true, shiftStart: true, shiftEnd: true, checkInAt: true, checkOutAt: true, lateMinutes: true, earlyMinutes: true },
    }),
    prisma.attendanceRequest.findMany({
      where: { userId: { in: ids }, status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } },
      select: { userId: true, type: true, startDate: true, endDate: true, dayPortion: true, lateMinutes: true, earlyMinutes: true, missedCheckIn: true, missedCheckOut: true },
    }),
  ]);

  const rows = staff.map((s): TimesheetRow => {
    const { days, summary } = buildAttendanceDays({
      dateKeys,
      todayKey,
      holidayKeys,
      records: records.filter((r) => r.userId === s.id),
      approvedRequests: requests.filter((r) => r.userId === s.id),
      shift: s.workplaceWarehouse?.attendanceSite ?? null,
    });
    return {
      userId: s.id, name: s.name, code: s.code, role: s.role,
      warehouseId: s.workplaceWarehouse?.id ?? null, warehouseName: s.workplaceWarehouse?.name ?? null,
      days, summary,
    };
  });

  return { dateKeys, holidayKeys: Array.from(holidayKeys), rows };
}
