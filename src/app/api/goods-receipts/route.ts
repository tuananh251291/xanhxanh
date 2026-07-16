import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateGoodsReceiptCode, generateLotCode } from "@/lib/codes";
import { getFinishedAvailableRooms } from "@/lib/processing";
import { createAlert } from "@/lib/inventory";
import { addDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const createSchema = z.object({
  supplierId: z.string().min(1),
  roomId: z.string().min(1),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        plantTypeId: z.string().min(1),
        quantityDelivered: z.number().int().positive(),
        quantityRejected: z.number().int().min(0),
      })
    )
    .min(1, "Cần ít nhất 1 dòng nhập hàng"),
});

// "Nhập hàng" — Kho thành phẩm ghi nhận 1 lần nhận hàng từ nhà cung cấp ngoài. Với mỗi dòng: phần "đạt"
// (quantityDelivered - quantityRejected) cộng thẳng vào 1 lô T01 ACTIVE trong Phòng khả dụng đã chọn
// (tăng cả tồn thực tế lẫn tồn khả dụng, giống pattern merge-hoặc-tạo-mới ở POST /api/processing-tickets);
// phần "không đạt" cộng vào 1 lô T01 ACTIVE trong Phòng theo dõi CÙNG kho đó (tăng tồn thực tế vì trang
// tồn thực tế cộng gộp mọi phòng của kho thành phẩm, nhưng KHÔNG tăng tồn khả dụng vì trang tồn khả dụng
// chỉ đọc Phòng khả dụng — xem src/app/(dashboard)/inventory/available/page.tsx).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { supplierId, roomId, notes, items } = parsed.data;

  for (const item of items) {
    if (item.quantityRejected > item.quantityDelivered) {
      return NextResponse.json({ message: "Số lượng không đạt không được lớn hơn số lượng bàn giao" }, { status: 400 });
    }
  }

  const [supplier, validRooms, creatingUser] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, isActive: true, allowsReturn: true, returnWindowDays: true } }),
    getFinishedAvailableRooms(),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } }),
  ]);
  if (!supplier || !supplier.isActive) {
    return NextResponse.json({ message: "Không tìm thấy nhà cung cấp" }, { status: 400 });
  }
  const room = validRooms.find((r) => r.id === roomId);
  if (!room) {
    return NextResponse.json({ message: "Phòng không hợp lệ — chỉ áp dụng Phòng khả dụng của kho thành phẩm" }, { status: 400 });
  }

  const roomWithWarehouse = await prisma.room.findUnique({ where: { id: roomId }, select: { warehouseId: true } });
  const rejectRoom = await prisma.room.findFirst({
    where: { warehouseId: roomWithWarehouse!.warehouseId, type: "PHONG_THEO_DOI", isActive: true },
    select: { id: true },
  });
  if (items.some((i) => i.quantityRejected > 0) && !rejectRoom) {
    return NextResponse.json({ message: "Kho này chưa có Phòng theo dõi — liên hệ Admin trước khi ghi nhận hàng không đạt" }, { status: 400 });
  }

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: Array.from(new Set(items.map((i) => i.plantTypeId))) } },
    select: { id: true, code: true, isActive: true },
  });
  const plantTypeById = new Map(plantTypes.map((p) => [p.id, p]));
  for (const item of items) {
    const pt = plantTypeById.get(item.plantTypeId);
    if (!pt || !pt.isActive) return NextResponse.json({ message: "Loại cây không hợp lệ" }, { status: 400 });
  }

  const staffCode = creatingUser?.code ?? "000";

  const upsertLot = async (
    tx: Prisma.TransactionClient,
    targetRoomId: string,
    plantTypeId: string,
    plantTypeCode: string,
    quantity: number
  ) => {
    const existingLot = await tx.lot.findFirst({
      where: { roomId: targetRoomId, plantTypeId, stageCode: "T01", status: "ACTIVE" },
      orderBy: { enteredAt: "asc" },
    });
    if (existingLot) {
      await tx.lot.update({ where: { id: existingLot.id }, data: { quantity: { increment: quantity } } });
      return;
    }
    const code = await generateLotCode({ plantTypeCode, staffCode, stageCode: "T01" });
    await tx.lot.create({
      data: {
        code,
        plantTypeId,
        stage: "THANH_PHAM",
        stageCode: "T01",
        roomId: targetRoomId,
        quantity,
        initialQuantity: quantity,
        status: "ACTIVE",
      },
    });
  };

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const code = await generateGoodsReceiptCode(tx);
      const created = await tx.goodsReceipt.create({
        data: {
          code,
          supplierId,
          roomId,
          createdById: session.user.id,
          notes,
          items: {
            create: items.map((i) => ({
              plantTypeId: i.plantTypeId,
              quantityDelivered: i.quantityDelivered,
              quantityRejected: i.quantityRejected,
              quantityPassed: i.quantityDelivered - i.quantityRejected,
            })),
          },
        },
      });

      for (const item of items) {
        const plantTypeCode = plantTypeById.get(item.plantTypeId)!.code;
        const quantityPassed = item.quantityDelivered - item.quantityRejected;
        if (quantityPassed > 0) {
          await upsertLot(tx, roomId, item.plantTypeId, plantTypeCode, quantityPassed);
        }
        if (item.quantityRejected > 0) {
          await upsertLot(tx, rejectRoom!.id, item.plantTypeId, plantTypeCode, item.quantityRejected);
        }
      }

      return created;
    });

    if (supplier.allowsReturn && supplier.returnWindowDays) {
      const deadline = addDays(receipt.createdAt, supplier.returnWindowDays);
      await createAlert({
        type: "GOODS_RECEIPT_RETURN_DUE",
        title: "Phiếu nhập hàng cần kiểm tra trả hàng",
        message: `Phiếu ${receipt.code} cần kiểm tra trước ${deadline.toLocaleDateString("vi-VN")} — xem trang Nhập hàng`,
        targetRole: "KHO_THANH_PHAM",
        relatedId: receipt.id,
        relatedType: "GoodsReceipt",
      });
    }

    return NextResponse.json(receipt, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Có lỗi xảy ra";
    return NextResponse.json({ message }, { status: 400 });
  }
}
