import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import { z } from "zod";

const completeSchema = z.object({
  action: z.literal("complete"),
  resultNotes: z.string().min(1, "Cần nhập ghi chú kết quả"),
  proposedAction: z.enum(["TRONG", "HUY"]).optional(),
});
const cancelSchema = z.object({ action: z.literal("cancel") });
// Quản lý kho thành phẩm gán/bỏ gán 1 NV cho nhiệm vụ (chủ yếu dùng cho việc DE_XUAT_TRONG_HUY tự sinh
// hàng tuần, chưa có ai lúc tạo — xem ensureWeeklyDeXuatTask). null = bỏ gán.
const assignSchema = z.object({ action: z.literal("assign"), assignedToId: z.string().nullable() });
// NV được gán bấm "Xác nhận" đã nhận nhiệm vụ — khoá không cho Quản lý đổi assignedToId nữa.
const ackSchema = z.object({ action: z.literal("ack") });
const patchSchema = z.discriminatedUnion("action", [completeSchema, cancelSchema, assignSchema, ackSchema]);

// Hoàn thành/hủy/gán 1 "Nhiệm vụ ngày" (Kiểm tra cây / Đề xuất trồng-hủy) — action=complete do đúng NV
// được gán hoặc Quản lý/Admin thực hiện; action=cancel/assign chỉ Quản lý/Admin. Hoàn thành xong báo lại
// đúng người đã gán (assignedById) qua alert ASSIGNED_TASK_COMPLETED — giống hệt pattern ở
// /api/transfers/[id], /api/goods-receipts/[id], /api/orders/[id].
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const task = await prisma.dailyTask.findUnique({ where: { id } });
  if (!task) return NextResponse.json({ message: "Không tìm thấy nhiệm vụ" }, { status: 404 });
  if (task.status !== "PENDING") return NextResponse.json({ message: "Nhiệm vụ này đã được xử lý" }, { status: 400 });

  const isManager = isAdminRole(session.user.role) || session.user.role === "QUAN_LY_KHO_THANH_PHAM";

  if (parsed.data.action === "cancel") {
    if (!isManager) return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới hủy được nhiệm vụ" }, { status: 403 });
    await prisma.dailyTask.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ success: true });
  }

  if (parsed.data.action === "assign") {
    if (!isManager) return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới gán được nhiệm vụ" }, { status: 403 });
    if (task.assignmentConfirmedAt) {
      return NextResponse.json({ message: "NV đã xác nhận nhận việc — không thể đổi người phụ trách khác" }, { status: 400 });
    }
    const { assignedToId } = parsed.data;
    if (assignedToId) {
      const staff = await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true } });
      if (!staff || !isKhoThanhPhamRole(staff.role)) {
        return NextResponse.json({ message: "Chỉ gán được cho NV/Quản lý kho thành phẩm" }, { status: 400 });
      }
    }
    const updated = await prisma.dailyTask.update({
      where: { id },
      data: { assignedToId: assignedToId ?? null, assignedById: assignedToId ? session.user.id : null, assignmentConfirmedAt: null },
      select: { id: true, assignedToId: true, assignedTo: { select: { name: true, code: true } }, assignmentConfirmedAt: true },
    });
    return NextResponse.json(updated);
  }

  if (parsed.data.action === "ack") {
    if (task.assignedToId !== session.user.id) {
      return NextResponse.json({ message: "Bạn không được giao nhiệm vụ này" }, { status: 403 });
    }
    if (task.assignmentConfirmedAt) {
      return NextResponse.json({ message: "Bạn đã xác nhận trước đó" }, { status: 400 });
    }
    const updated = await prisma.dailyTask.update({
      where: { id },
      data: { assignmentConfirmedAt: new Date() },
      select: { id: true, assignmentConfirmedAt: true },
    });
    return NextResponse.json(updated);
  }

  // action === "complete" — DE_XUAT_TRONG_HUY giờ hoàn thành tự động khi Admin duyệt hết đề xuất liên
  // kết (xem ensureDeXuatTaskCompletion), không còn hoàn thành bằng ghi chú tự do nữa.
  if (task.type === "DE_XUAT_TRONG_HUY") {
    return NextResponse.json(
      { message: "Việc này hoàn thành tự động khi Admin duyệt xong đề xuất — vào \"Thực hiện\" để gửi đề xuất." },
      { status: 400 }
    );
  }

  if (task.assignedToId !== session.user.id && !isManager) {
    return NextResponse.json({ message: "Bạn không được giao nhiệm vụ này" }, { status: 403 });
  }

  const updated = await prisma.dailyTask.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      resultNotes: parsed.data.resultNotes,
      proposedAction: parsed.data.proposedAction,
    },
  });

  if (task.assignedById) {
    await createAlert({
      type: "ASSIGNED_TASK_COMPLETED",
      title: "NV đã hoàn thành việc được giao",
      message: `Đã hoàn thành nhiệm vụ ${task.code}`,
      userId: task.assignedById,
      relatedId: task.id,
      relatedType: "DailyTask",
    });
  }

  return NextResponse.json(updated);
}
