import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upsertLot } from "@/lib/goods-receipt";
import { createAlert } from "@/lib/inventory";
import { addDays } from "date-fns";
import { z } from "zod";

const confirmSchema = z.object({
  action: z.literal("confirm"),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantityDelivered: z.number().int().min(0),
        quantityRejected: z.number().int().min(0),
      })
    )
    .min(1),
});
const cancelSchema = z.object({ action: z.literal("cancel") });
const patchSchema = z.discriminatedUnion("action", [confirmSchema, cancelSchema]);

// Quản lý 1 "Kế hoạch nhập kho" (GoodsReceipt.status = PLANNED) — chỉ áp dụng được khi phiếu còn PLANNED.
//
// action=confirm: Kho thành phẩm nhập số liệu THẬT (có thể khác ước tính lúc lập kế hoạch), ghi đè lên
// GoodsReceiptItem, chuyển lô "ảo" (plannedLotId) sang ACTIVE với đúng số lượng "đạt" thật, cộng phần
// "không đạt" vào Phòng theo dõi cùng kho (y hệt nhánh nhập hàng thật của POST /api/goods-receipts).
// Nếu số "đạt" thật ít hơn tổng đã bị các đơn HELD/CONFIRMED giữ chỗ trên lô đó → CHẶN xác nhận, báo rõ
// đơn nào bị ảnh hưởng để Admin/Sale tự xử lý (không tự hủy đơn nào).
//
// action=cancel: hủy hẳn kế hoạch (hàng không về) — cũng chặn nếu đã có đơn giữ chỗ dựa vào lô kế hoạch.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM" && session?.user?.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      items: { include: { plantType: { select: { code: true } } } },
      room: { select: { warehouseId: true } },
    },
  });
  if (!receipt) return NextResponse.json({ message: "Không tìm thấy phiếu" }, { status: 404 });
  if (receipt.room.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Phiếu này thuộc kho thành phẩm khác — không đúng địa điểm làm việc của bạn" }, { status: 403 });
  }
  if (receipt.status !== "PLANNED") {
    return NextResponse.json({ message: "Phiếu này không còn ở trạng thái Kế hoạch" }, { status: 400 });
  }

  // Số lượng đang bị các đơn HELD/CONFIRMED giữ chỗ trên lô "ảo" của 1 dòng — dùng chung cho cả 2 action
  // (confirm cần so với số thật, cancel cần biết có đơn nào phụ thuộc không).
  const getHeldQuantity = async (plannedLotId: string) => {
    const agg = await prisma.orderItem.aggregate({
      where: { lotId: plannedLotId, order: { status: { in: ["HELD", "CONFIRMED"] } } },
      _sum: { quantity: true },
    });
    return agg._sum.quantity ?? 0;
  };

  if (parsed.data.action === "cancel") {
    const heldPerItem = await Promise.all(
      receipt.items.map(async (item) => ({ item, held: item.plannedLotId ? await getHeldQuantity(item.plannedLotId) : 0 }))
    );
    const blocking = heldPerItem.filter((h) => h.held > 0);
    if (blocking.length > 0) {
      const detail = blocking.map((h) => `${h.item.plantType.code} (${h.item.stageCode}): ${h.held} cây`).join(", ");
      return NextResponse.json(
        { message: `Có đơn hàng đang giữ chỗ dựa vào kế hoạch này — không thể hủy (${detail})` },
        { status: 409 }
      );
    }

    await prisma.$transaction([
      prisma.lot.updateMany({
        where: { id: { in: receipt.items.map((i) => i.plannedLotId).filter((v): v is string => !!v) } },
        data: { status: "DESTROYED", quantity: 0 },
      }),
      prisma.goodsReceipt.update({ where: { id }, data: { status: "CANCELLED" } }),
    ]);
    return NextResponse.json({ success: true });
  }

  // action === "confirm"
  const actualById = new Map(parsed.data.items.map((i) => [i.itemId, i]));
  for (const item of receipt.items) {
    const actual = actualById.get(item.id);
    if (!actual) return NextResponse.json({ message: "Thiếu số liệu thật cho 1 dòng trong phiếu" }, { status: 400 });
    if (actual.quantityRejected > actual.quantityDelivered) {
      return NextResponse.json({ message: `${item.plantType.code} (${item.stageCode}): Số lượng không đạt không được lớn hơn số lượng bàn giao` }, { status: 400 });
    }
  }

  let rejectRoomId: string | null = null;
  if (parsed.data.items.some((i) => i.quantityRejected > 0)) {
    const rejectRoom = await prisma.room.findFirst({
      where: { warehouseId: receipt.room.warehouseId, type: "PHONG_THEO_DOI", isActive: true },
      select: { id: true },
    });
    if (!rejectRoom) {
      return NextResponse.json({ message: "Kho này chưa có Phòng theo dõi — liên hệ Admin trước khi ghi nhận hàng không đạt" }, { status: 400 });
    }
    rejectRoomId = rejectRoom.id;
  }

  for (const item of receipt.items) {
    if (!item.plannedLotId) continue;
    const actual = actualById.get(item.id)!;
    const quantityPassed = actual.quantityDelivered - actual.quantityRejected;
    const held = await getHeldQuantity(item.plannedLotId);
    if (held > quantityPassed) {
      return NextResponse.json(
        {
          message: `${item.plantType.code} (${item.stageCode}): số lượng đạt thật (${quantityPassed}) không đủ cho các đơn đã giữ chỗ (${held}) — xử lý các đơn này trước khi xác nhận`,
        },
        { status: 409 }
      );
    }
  }

  const staffUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
  const staffCode = staffUser?.code ?? "000";

  await prisma.$transaction(async (tx) => {
    for (const item of receipt.items) {
      const actual = actualById.get(item.id)!;
      const quantityPassed = actual.quantityDelivered - actual.quantityRejected;

      await tx.goodsReceiptItem.update({
        where: { id: item.id },
        data: { quantityDelivered: actual.quantityDelivered, quantityRejected: actual.quantityRejected, quantityPassed },
      });

      if (item.plannedLotId) {
        await tx.lot.update({
          where: { id: item.plannedLotId },
          data: { status: "ACTIVE", quantity: quantityPassed, initialQuantity: quantityPassed, expectedDate: null },
        });
      }
      if (actual.quantityRejected > 0 && rejectRoomId) {
        await upsertLot(tx, rejectRoomId, item.plantTypeId, item.plantType.code, item.stageCode, actual.quantityRejected, staffCode);
      }
    }

    await tx.goodsReceipt.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: session.user.id },
    });
  });

  const supplier = await prisma.supplier.findUnique({ where: { id: receipt.supplierId }, select: { allowsReturn: true, returnWindowDays: true } });
  if (supplier?.allowsReturn && supplier.returnWindowDays) {
    const deadline = addDays(new Date(), supplier.returnWindowDays);
    await createAlert({
      type: "GOODS_RECEIPT_RETURN_DUE",
      title: "Phiếu nhập hàng cần kiểm tra trả hàng",
      message: `Phiếu ${receipt.code} cần kiểm tra trước ${deadline.toLocaleDateString("vi-VN")} — xem trang Nhập hàng`,
      targetRole: "KHO_THANH_PHAM",
      relatedId: receipt.id,
      relatedType: "GoodsReceipt",
    });
  }

  return NextResponse.json({ success: true });
}
