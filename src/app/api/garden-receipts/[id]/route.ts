import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canManageGarden } from "@/lib/garden-staff";
import { addGardenStock, getDiscrepancyRecipients } from "@/lib/garden-receipt";
import { z } from "zod";

const schema = z.discriminatedUnion("action", [
  // Giao kiểm đếm cho chính mình ("SELF") hoặc 1 Nhân viên phân loại (id GardenStaff) — lần đầu hoặc kiểm tra lại.
  z.object({ action: z.literal("assign"), assignee: z.string().min(1) }),
  // Nhập số thực nhận từng dòng → hệ thống tính chênh lệch = thực nhận − bàn giao.
  z.object({ action: z.literal("count"), items: z.array(z.object({ itemId: z.string().min(1), receivedQuantity: z.number().int().min(0) })).min(1) }),
  // Admin cấp cao duyệt số lệch — ghi nhận đúng số thực nhận vào tồn vườn.
  z.object({ action: z.literal("approve") }),
]);

class FlowError extends Error {}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const data = parsed.data;

  const receipt = await prisma.gardenReceipt.findUnique({
    where: { id },
    select: {
      id: true, code: true, status: true, gardenId: true, orderType: true, fromWarehouseId: true, fromRoomId: true, createdById: true,
      garden: { select: { name: true } }, fromWarehouse: { select: { name: true } },
      items: { select: { id: true, quantity: true, plantTypeId: true, stageCode: true, receivedQuantity: true, firstReceivedQuantity: true, plantType: { select: { code: true } } } },
    },
  });
  if (!receipt) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });

  try {
    if (data.action === "approve") {
      if (session.user.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Chỉ Admin cấp cao duyệt được số lệch" }, { status: 403 });
      await prisma.$transaction(async (tx) => {
        const locked = await tx.gardenReceipt.updateMany({
          where: { id, status: "DISCREPANCY" },
          data: { status: "COMPLETED", approvedById: session.user.id, approvedAt: new Date(), completedAt: new Date() },
        });
        if (locked.count === 0) throw new FlowError("Phiếu không còn ở trạng thái lệch");
        for (const it of receipt.items) await addGardenStock(tx, receipt.gardenId, receipt.orderType, it.plantTypeId, it.stageCode, it.receivedQuantity ?? 0);
      });
      const recipients = await getDiscrepancyRecipients(receipt);
      for (const userId of recipients.filter((u) => u !== session.user.id)) {
        await createAlert({
          type: "GARDEN_RECEIPT_COMPLETED", title: "Admin cấp cao đã duyệt số lệch",
          message: `Phiếu ${receipt.code} (${receipt.fromWarehouse.name} → ${receipt.garden.name}) được duyệt theo số thực nhận của vườn.`,
          userId, relatedId: id, relatedType: "GardenReceipt",
        });
      }
      return NextResponse.json({ success: true, message: "Đã duyệt số lệch — cộng số thực nhận vào tồn vườn" });
    }

    // assign / count — Quản lý vườn của vườn nhận (hoặc Admin).
    if (!(await canManageGarden(session.user, receipt.gardenId))) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

    if (data.action === "assign") {
      if (receipt.status !== "PENDING" && receipt.status !== "DISCREPANCY" && receipt.status !== "COUNTING") {
        return NextResponse.json({ message: "Phiếu đã nhận xong" }, { status: 400 });
      }
      let assignedUserId: string | null = null;
      let assignedStaffId: string | null = null;
      if (data.assignee === "SELF") {
        assignedUserId = session.user.id;
      } else {
        const staff = await prisma.gardenStaff.findFirst({ where: { id: data.assignee, gardenId: receipt.gardenId, isActive: true, types: { has: "PHAN_LOAI" } }, select: { id: true } });
        if (!staff) return NextResponse.json({ message: "Nhân viên phân loại không hợp lệ" }, { status: 400 });
        assignedStaffId = staff.id;
      }
      await prisma.gardenReceipt.update({
        where: { id },
        data: { status: "COUNTING", assignedUserId, assignedStaffId, assignedAt: new Date() },
      });
      return NextResponse.json({ success: true, message: receipt.status === "DISCREPANCY" ? "Đã giao kiểm tra lại" : "Đã giao kiểm đếm" });
    }

    // count
    if (receipt.status !== "COUNTING") return NextResponse.json({ message: "Cần giao kiểm đếm trước khi nhập số" }, { status: 400 });
    const receivedById = new Map(data.items.map((i) => [i.itemId, i.receivedQuantity]));
    if (receipt.items.some((it) => !receivedById.has(it.id))) return NextResponse.json({ message: "Cần nhập số thực nhận cho mọi dòng" }, { status: 400 });
    const hasDiff = receipt.items.some((it) => receivedById.get(it.id)! !== it.quantity);

    await prisma.$transaction(async (tx) => {
      const locked = await tx.gardenReceipt.updateMany({
        where: { id, status: "COUNTING" },
        data: {
          status: hasDiff ? "DISCREPANCY" : "COMPLETED",
          countRound: { increment: 1 }, countedById: session.user.id, countedAt: new Date(),
          ...(hasDiff ? {} : { completedAt: new Date() }),
        },
      });
      if (locked.count === 0) throw new FlowError("Phiếu vừa được người khác cập nhật — tải lại trang");
      for (const it of receipt.items) {
        const received = receivedById.get(it.id)!;
        await tx.gardenReceiptItem.update({
          where: { id: it.id },
          data: { receivedQuantity: received, ...(it.firstReceivedQuantity === null ? { firstReceivedQuantity: received } : {}) },
        });
        if (!hasDiff) await addGardenStock(tx, receipt.gardenId, receipt.orderType, it.plantTypeId, it.stageCode, received);
      }
    });

    if (hasDiff) {
      const diffText = receipt.items
        .filter((it) => receivedById.get(it.id)! !== it.quantity)
        .map((it) => {
          const diff = receivedById.get(it.id)! - it.quantity;
          return `${it.plantType.code} ${it.stageCode}: giao ${it.quantity.toLocaleString("vi-VN")}, nhận ${receivedById.get(it.id)!.toLocaleString("vi-VN")} (${diff > 0 ? "+" : ""}${diff.toLocaleString("vi-VN")})`;
        })
        .join("; ");
      for (const userId of await getDiscrepancyRecipients(receipt)) {
        await createAlert({
          type: "GARDEN_RECEIPT_DISCREPANCY", title: "Phiếu bàn giao cây về vườn bị lệch",
          message: `Phiếu ${receipt.code} (${receipt.fromWarehouse.name} → ${receipt.garden.name}) lệch số lượng — ${diffText}. Vui lòng kiểm tra lại.`,
          userId, relatedId: id, relatedType: "GardenReceipt",
        });
      }
      return NextResponse.json({ success: true, discrepancy: true, message: "Có chênh lệch — đã gửi thông báo kiểm tra lại cho bên giao và Admin cấp cao" });
    }

    await createAlert({
      type: "GARDEN_RECEIPT_COMPLETED", title: "Vườn đã nhận đủ phiếu bàn giao",
      message: `Phiếu ${receipt.code} đã được ${receipt.garden.name} nhận đủ số lượng.`,
      userId: receipt.createdById, relatedId: id, relatedType: "GardenReceipt",
    });
    return NextResponse.json({ success: true, discrepancy: false, message: "Khớp số lượng — đã cộng vào tồn kho vườn" });
  } catch (err) {
    if (err instanceof FlowError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }
}
