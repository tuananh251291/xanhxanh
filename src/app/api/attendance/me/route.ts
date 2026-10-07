import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAttendanceRole, vnDateKey, toAttendanceWorkDate, vnTimeLabel } from "@/lib/attendance";
import { MONTH_REGEX, buildMonthlyTimesheet, getAnnualLeaveUsage, getStaffAttendanceContext } from "@/lib/attendance-server";

// Trang "Chấm công" của NV: trạng thái hôm nay, cài đặt ca của khu, bảng công tháng, quỹ phép, đơn của mình.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceRole(session?.user?.role)) {
    return NextResponse.json({ message: "Vai trò của bạn không chấm công trên phần mềm" }, { status: 403 });
  }
  const userId = session!.user.id;
  const todayKey = vnDateKey(new Date());
  const month = req.nextUrl.searchParams.get("month") ?? todayKey.slice(0, 7);
  if (!MONTH_REGEX.test(month)) return NextResponse.json({ message: "Tháng không hợp lệ" }, { status: 400 });

  const ctx = await getStaffAttendanceContext(userId);
  const site = ctx?.workplaceWarehouse?.attendanceSite ?? null;

  const [today, timesheet, leave, requests] = await Promise.all([
    prisma.attendanceRecord.findUnique({
      where: { userId_workDate: { userId, workDate: toAttendanceWorkDate(todayKey) } },
      select: { checkInAt: true, checkOutAt: true, lateMinutes: true, earlyMinutes: true },
    }),
    buildMonthlyTimesheet({ month, userIds: [userId] }),
    getAnnualLeaveUsage(userId, Number(todayKey.slice(0, 4))),
    prisma.attendanceRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, type: true, status: true, startDate: true, endDate: true, dayPortion: true, leaveDays: true,
        lateMinutes: true, earlyMinutes: true, missedCheckIn: true, missedCheckOut: true, reason: true,
        managerNote: true, hrNote: true, createdAt: true,
        manager: { select: { name: true } }, hr: { select: { name: true } },
      },
    }),
  ]);

  return NextResponse.json({
    todayKey,
    month,
    warehouse: ctx?.workplaceWarehouse ? { id: ctx.workplaceWarehouse.id, name: ctx.workplaceWarehouse.name } : null,
    site: site
      ? {
          configured: site.latitude != null && site.longitude != null,
          // Toạ độ khu của chính NV — để trang tính khoảng cách ngay trên máy trước khi chụp ảnh.
          latitude: site.latitude, longitude: site.longitude,
          shiftStart: site.shiftStart, shiftEnd: site.shiftEnd, breakStart: site.breakStart, breakEnd: site.breakEnd,
          graceMinutes: site.graceMinutes, radiusMeters: site.radiusMeters,
        }
      : null,
    today: today
      ? {
          checkIn: today.checkInAt ? vnTimeLabel(today.checkInAt) : null,
          checkOut: today.checkOutAt ? vnTimeLabel(today.checkOutAt) : null,
          lateMinutes: today.lateMinutes, earlyMinutes: today.earlyMinutes,
        }
      : null,
    days: timesheet.rows[0]?.days ?? [],
    summary: timesheet.rows[0]?.summary ?? null,
    leave,
    requests,
  });
}
