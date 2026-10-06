import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { toAttendanceWorkDate, vnTimeLabel } from "@/lib/attendance";
import { getApproverWarehouseIds, isAttendanceHr } from "@/lib/attendance-server";
import { signAttendanceSelfies } from "@/lib/attendance-storage";

// GET ?userId=&date=yyyy-MM-dd — chi tiết 1 ngày chấm công (giờ, khoảng cách GPS, ảnh selfie ký tạm 1 giờ)
// + các đơn liên quan ngày đó. Xem được: HCNS, quản lý khu của NV đó, hoặc chính NV.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId") ?? "";
  const date = sp.get("date") ?? "";
  if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ message: "Thiếu tham số" }, { status: 400 });

  const isSelf = userId === session.user.id;
  if (!isSelf && !isAttendanceHr(session.user.role)) {
    const [staff, managerWarehouseIds] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { workplaceWarehouseId: true } }),
      getApproverWarehouseIds(session.user.id),
    ]);
    if (!staff?.workplaceWarehouseId || !managerWarehouseIds.includes(staff.workplaceWarehouseId)) {
      return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
    }
  }

  const workDate = toAttendanceWorkDate(date);
  const [record, requests] = await Promise.all([
    prisma.attendanceRecord.findUnique({ where: { userId_workDate: { userId, workDate } } }),
    prisma.attendanceRequest.findMany({
      where: { userId, startDate: { lte: workDate }, endDate: { gte: workDate }, status: { not: "CANCELLED" } },
      select: { id: true, type: true, status: true, dayPortion: true, lateMinutes: true, earlyMinutes: true, missedCheckIn: true, missedCheckOut: true, reason: true },
    }),
  ]);

  const signed = record
    ? await signAttendanceSelfies([record.checkInPhotoPath, record.checkOutPhotoPath].filter((p): p is string => !!p)).catch(() => new Map<string, string>())
    : new Map<string, string>();

  return NextResponse.json({
    record: record
      ? {
          shiftStart: record.shiftStart, shiftEnd: record.shiftEnd,
          checkIn: record.checkInAt ? vnTimeLabel(record.checkInAt) : null,
          checkOut: record.checkOutAt ? vnTimeLabel(record.checkOutAt) : null,
          checkInDistance: record.checkInDistance, checkOutDistance: record.checkOutDistance,
          checkInLat: record.checkInLat, checkInLng: record.checkInLng,
          checkOutLat: record.checkOutLat, checkOutLng: record.checkOutLng,
          lateMinutes: record.lateMinutes, earlyMinutes: record.earlyMinutes,
          checkInPhotoUrl: record.checkInPhotoPath ? signed.get(record.checkInPhotoPath) ?? null : null,
          checkOutPhotoUrl: record.checkOutPhotoPath ? signed.get(record.checkOutPhotoPath) ?? null : null,
          photosPurged: !record.checkInPhotoPath && !record.checkOutPhotoPath && !!record.checkInAt,
        }
      : null,
    requests,
  });
}
