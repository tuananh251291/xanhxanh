import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { HHMM_REGEX, parseHhmm } from "@/lib/attendance";
import { isAttendanceHr } from "@/lib/attendance-server";

const HHMM = z.string().regex(HHMM_REGEX, "Giờ phải dạng HH:mm");

const schema = z
  .object({
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    radiusMeters: z.number().int().min(20, "Bán kính tối thiểu 20m").max(2000, "Bán kính tối đa 2000m"),
    shiftStart: HHMM,
    shiftEnd: HHMM,
    breakStart: HHMM.nullable(),
    breakEnd: HHMM.nullable(),
    graceMinutes: z.number().int().min(0).max(120),
    approverId: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if ((v.latitude == null) !== (v.longitude == null)) ctx.addIssue({ code: "custom", message: "Nhập đủ cả vĩ độ và kinh độ" });
    if (parseHhmm(v.shiftEnd) <= parseHhmm(v.shiftStart)) ctx.addIssue({ code: "custom", message: "Giờ kết thúc ca phải sau giờ bắt đầu" });
    if ((v.breakStart == null) !== (v.breakEnd == null)) ctx.addIssue({ code: "custom", message: "Nhập đủ giờ bắt đầu và kết thúc nghỉ trưa" });
    if (v.breakStart && v.breakEnd && parseHhmm(v.breakEnd) <= parseHhmm(v.breakStart)) {
      ctx.addIssue({ code: "custom", message: "Giờ kết thúc nghỉ trưa phải sau giờ bắt đầu" });
    }
  });

// PUT — HCNS lưu cài đặt chấm công của 1 khu.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ warehouseId: string }> }) {
  const session = await auth();
  if (!isAttendanceHr(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { warehouseId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const data = parsed.data;

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { id: true } });
  if (!warehouse) return NextResponse.json({ message: "Không tìm thấy khu" }, { status: 404 });
  if (data.approverId) {
    const approver = await prisma.user.findUnique({ where: { id: data.approverId }, select: { isActive: true } });
    if (!approver?.isActive) return NextResponse.json({ message: "Người duyệt không hợp lệ" }, { status: 400 });
  }

  const previous = await prisma.attendanceSite.findUnique({ where: { warehouseId }, select: { approverId: true } });

  const site = await prisma.$transaction(async (tx) => {
    const saved = await tx.attendanceSite.upsert({ where: { warehouseId }, create: { warehouseId, ...data }, update: data });
    // Đổi người duyệt cấp 1 — chuyển các đơn đang chờ quản lý cũ sang người mới (hoặc lên thẳng HCNS nếu bỏ
    // trống), tránh đơn bị treo ở người không còn phụ trách.
    if ((previous?.approverId ?? null) !== data.approverId) {
      const pending = await tx.attendanceRequest.findMany({
        where: { warehouseId, status: "PENDING_MANAGER" },
        select: { id: true, userId: true },
      });
      for (const r of pending) {
        const nextManager = data.approverId && data.approverId !== r.userId ? data.approverId : null;
        await tx.attendanceRequest.update({
          where: { id: r.id },
          data: nextManager ? { managerId: nextManager } : { managerId: null, status: "PENDING_HR" },
        });
        await tx.alert.updateMany({ where: { type: "ATTENDANCE_REQUEST", relatedId: r.id, status: "UNREAD" }, data: { status: "READ", readAt: new Date() } });
        await tx.alert.create({
          data: {
            type: "ATTENDANCE_REQUEST", relatedId: r.id, relatedType: "AttendanceRequest",
            title: "Đơn chấm công cần duyệt", message: "Đơn được chuyển sang bạn do thay đổi người duyệt khu",
            ...(nextManager ? { userId: nextManager } : { targetRole: "HANH_CHINH_NHAN_SU" as const }),
          },
        });
      }
    }
    return saved;
  });

  return NextResponse.json(site);
}
