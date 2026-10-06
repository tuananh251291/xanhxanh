import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ATTENDANCE_REQUEST_TYPE_LABELS } from "@/lib/attendance";
import { isAttendanceHr } from "@/lib/attendance-server";

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  note: z.string().trim().max(500).optional(),
});

// PATCH — duyệt 2 cấp: quản lý khu (managerId) duyệt PENDING_MANAGER → PENDING_HR; HCNS duyệt PENDING_HR →
// APPROVED. Từ chối được ở cả 2 cấp (bắt buộc ghi lý do). NV tự huỷ khi đơn chưa duyệt xong.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { action, note } = parsed.data;

  const request = await prisma.attendanceRequest.findUnique({
    where: { id },
    select: { id: true, userId: true, type: true, status: true, managerId: true, user: { select: { name: true } } },
  });
  if (!request) return NextResponse.json({ message: "Không tìm thấy đơn" }, { status: 404 });

  const userId = session.user.id;
  const now = new Date();

  if (action === "CANCEL") {
    if (request.userId !== userId) return NextResponse.json({ message: "Chỉ người gửi mới huỷ được đơn" }, { status: 403 });
    if (request.status !== "PENDING_MANAGER" && request.status !== "PENDING_HR") {
      return NextResponse.json({ message: "Đơn đã được xử lý, không huỷ được nữa" }, { status: 400 });
    }
    await prisma.attendanceRequest.updateMany({ where: { id, status: request.status }, data: { status: "CANCELLED" } });
    await prisma.alert.updateMany({ where: { type: "ATTENDANCE_REQUEST", relatedId: id, status: "UNREAD" }, data: { status: "READ", readAt: now } });
    return NextResponse.json({ ok: true });
  }

  if (action === "REJECT" && !note) {
    return NextResponse.json({ message: "Nhập lý do từ chối" }, { status: 400 });
  }

  const isHr = isAttendanceHr(session.user.role);
  const typeLabel = ATTENDANCE_REQUEST_TYPE_LABELS[request.type].toLowerCase();

  if (request.status === "PENDING_MANAGER") {
    if (request.managerId !== userId) {
      return NextResponse.json({ message: "Đơn đang chờ quản lý khu duyệt trước" }, { status: 403 });
    }
    const approve = action === "APPROVE";
    // Khoá theo trạng thái lúc đọc — 2 người bấm cùng lúc thì chỉ 1 người thành công.
    const { count } = await prisma.attendanceRequest.updateMany({
      where: { id, status: "PENDING_MANAGER" },
      data: { status: approve ? "PENDING_HR" : "REJECTED", managerNote: note ?? null, managerAt: now },
    });
    if (count === 0) return NextResponse.json({ message: "Đơn vừa được xử lý bởi người khác" }, { status: 409 });
    await prisma.alert.updateMany({ where: { type: "ATTENDANCE_REQUEST", relatedId: id, status: "UNREAD" }, data: { status: "READ", readAt: now } });
    if (approve) {
      await prisma.alert.create({
        data: {
          type: "ATTENDANCE_REQUEST", targetRole: "HANH_CHINH_NHAN_SU", relatedId: id, relatedType: "AttendanceRequest",
          title: `Đơn ${typeLabel} cần duyệt`,
          message: `${request.user.name} — quản lý khu đã duyệt, chờ HCNS duyệt`,
        },
      });
    } else {
      await notifyRequester(request.userId, id, `Đơn ${typeLabel} bị từ chối`, `Quản lý khu từ chối: ${note}`);
    }
    return NextResponse.json({ ok: true });
  }

  if (request.status === "PENDING_HR") {
    if (!isHr) return NextResponse.json({ message: "Chỉ HCNS duyệt cấp 2" }, { status: 403 });
    const approve = action === "APPROVE";
    const { count } = await prisma.attendanceRequest.updateMany({
      where: { id, status: "PENDING_HR" },
      data: { status: approve ? "APPROVED" : "REJECTED", hrId: userId, hrNote: note ?? null, hrAt: now },
    });
    if (count === 0) return NextResponse.json({ message: "Đơn vừa được xử lý bởi người khác" }, { status: 409 });
    await prisma.alert.updateMany({ where: { type: "ATTENDANCE_REQUEST", relatedId: id, status: "UNREAD" }, data: { status: "READ", readAt: now } });
    await notifyRequester(
      request.userId, id,
      approve ? `Đơn ${typeLabel} đã được duyệt` : `Đơn ${typeLabel} bị từ chối`,
      approve ? (note ? `HCNS: ${note}` : "HCNS đã duyệt đơn của bạn") : `HCNS từ chối: ${note}`
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ message: "Đơn đã được xử lý xong" }, { status: 400 });
}

async function notifyRequester(userId: string, requestId: string, title: string, message: string) {
  await prisma.alert.create({
    data: { type: "ATTENDANCE_REQUEST_DECIDED", userId, relatedId: requestId, relatedType: "AttendanceRequest", title, message },
  });
}
