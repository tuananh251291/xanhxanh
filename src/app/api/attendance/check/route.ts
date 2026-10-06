import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  ATTENDANCE_SELFIE_MAX_DATA_URL_LENGTH,
  distanceMeters,
  isAttendanceRole,
  parseHhmm,
  toAttendanceWorkDate,
  vnDateKey,
  vnMinutesOfDay,
  vnTimeLabel,
} from "@/lib/attendance";
import { getStaffAttendanceContext } from "@/lib/attendance-server";
import { deleteAttendanceSelfie, uploadAttendanceSelfie } from "@/lib/attendance-storage";

const schema = z.object({
  action: z.enum(["IN", "OUT"]),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  image: z.string().regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Ảnh selfie không hợp lệ"),
});

// Chấm vào / chấm ra — bắt buộc GPS trong bán kính khu + ảnh selfie. Giờ chấm lấy theo giờ SERVER (không
// tin giờ điện thoại), so với ca của khu theo giờ Việt Nam.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceRole(session?.user?.role)) {
    return NextResponse.json({ message: "Vai trò của bạn không chấm công trên phần mềm" }, { status: 403 });
  }
  const userId = session!.user.id;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { action, latitude, longitude, accuracy, image } = parsed.data;
  if (image.length > ATTENDANCE_SELFIE_MAX_DATA_URL_LENGTH) {
    return NextResponse.json({ message: "Ảnh quá lớn, vui lòng chụp lại" }, { status: 400 });
  }

  const ctx = await getStaffAttendanceContext(userId);
  const warehouse = ctx?.workplaceWarehouse;
  if (!warehouse) {
    return NextResponse.json({ message: "Bạn chưa được gắn khu làm việc — liên hệ HCNS" }, { status: 400 });
  }
  const site = warehouse.attendanceSite;
  if (!site || site.latitude == null || site.longitude == null) {
    return NextResponse.json({ message: `HCNS chưa cài vị trí chấm công cho ${warehouse.name}` }, { status: 400 });
  }

  const distance = distanceMeters(latitude, longitude, site.latitude, site.longitude);
  if (distance > site.radiusMeters) {
    const weakGps = accuracy && accuracy > 50 ? ` — GPS đang kém chính xác (±${Math.round(accuracy)}m), thử ra chỗ thoáng rồi chấm lại` : "";
    return NextResponse.json(
      { message: `Bạn đang cách ${warehouse.name} khoảng ${distance}m (cho phép ${site.radiusMeters}m)${weakGps}` },
      { status: 400 }
    );
  }

  const now = new Date();
  const todayKey = vnDateKey(now);
  const workDate = toAttendanceWorkDate(todayKey);
  const existing = await prisma.attendanceRecord.findUnique({ where: { userId_workDate: { userId, workDate } } });

  if (action === "IN" && existing?.checkInAt) {
    return NextResponse.json({ message: `Hôm nay bạn đã chấm vào lúc ${vnTimeLabel(existing.checkInAt)}` }, { status: 400 });
  }
  if (action === "OUT" && !existing?.checkInAt) {
    return NextResponse.json({ message: "Bạn chưa chấm vào hôm nay — chấm vào trước, hoặc gửi đơn Quên chấm công" }, { status: 400 });
  }

  let photoPath: string;
  try {
    photoPath = await uploadAttendanceSelfie(image, `${userId}/${todayKey}-${action.toLowerCase()}-${now.getTime()}`);
  } catch (e) {
    return NextResponse.json({ message: e instanceof Error ? e.message : "Tải ảnh lên thất bại" }, { status: 500 });
  }

  const nowMinutes = vnMinutesOfDay(now);
  if (action === "IN") {
    const lateMinutes = Math.max(0, nowMinutes - parseHhmm(site.shiftStart) - site.graceMinutes);
    const data = {
      warehouseId: warehouse.id,
      shiftStart: site.shiftStart,
      shiftEnd: site.shiftEnd,
      checkInAt: now,
      checkInLat: latitude,
      checkInLng: longitude,
      checkInDistance: distance,
      checkInPhotoPath: photoPath,
      lateMinutes,
    };
    await prisma.attendanceRecord.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: { userId, workDate, ...data },
      update: data,
    });
    return NextResponse.json({ ok: true, time: vnTimeLabel(now), lateMinutes, distance });
  }

  // Chấm ra nhiều lần trong ngày được — lấy lần cuối (giống Fastwork).
  const earlyMinutes = Math.max(0, parseHhmm(existing!.shiftEnd) - nowMinutes - site.graceMinutes);
  await prisma.attendanceRecord.update({
    where: { id: existing!.id },
    data: { checkOutAt: now, checkOutLat: latitude, checkOutLng: longitude, checkOutDistance: distance, checkOutPhotoPath: photoPath, earlyMinutes },
  });
  if (existing!.checkOutPhotoPath) await deleteAttendanceSelfie(existing!.checkOutPhotoPath).catch(() => null);
  return NextResponse.json({ ok: true, time: vnTimeLabel(now), earlyMinutes, distance });
}
