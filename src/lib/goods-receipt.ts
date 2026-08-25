import type { Prisma } from "@prisma/client";
import { generateLotCode, generateGoodsReceiptCode } from "@/lib/codes";

// Merge-hoặc-tạo-mới 1 lô ACTIVE theo (phòng, loại cây, quy cách) — dùng chung cho luồng "Nhập hàng"
// (POST /api/goods-receipts, cả nhánh nhập hàng thật lẫn xác nhận số liệu thật của 1 Kế hoạch nhập kho ở
// PATCH /api/goods-receipts/[id]/confirm) và các nơi khác có cùng nhu cầu cộng dồn lô theo phòng/quy cách.
export async function upsertLot(
  tx: Prisma.TransactionClient,
  targetRoomId: string,
  plantTypeId: string,
  plantTypeCode: string,
  stageCode: string,
  quantity: number,
  staffCode: string
): Promise<void> {
  const existingLot = await tx.lot.findFirst({
    where: { roomId: targetRoomId, plantTypeId, stageCode, status: "ACTIVE" },
    orderBy: { enteredAt: "asc" },
  });
  if (existingLot) {
    await tx.lot.update({ where: { id: existingLot.id }, data: { quantity: { increment: quantity } } });
    return;
  }
  const code = await generateLotCode({ plantTypeCode, staffCode, stageCode, client: tx });
  await tx.lot.create({
    data: {
      code,
      plantTypeId,
      stage: "THANH_PHAM",
      stageCode,
      roomId: targetRoomId,
      quantity,
      initialQuantity: quantity,
      status: "ACTIVE",
    },
  });
}

// Tạo 1 "Kế hoạch nhập kho" (GoodsReceipt status=PLANNED) + 1 lô "ảo" (Lot status=PLANNED) mỗi dòng —
// tách ra từ nhánh PLANNED của POST /api/goods-receipts để dùng chung với luồng nhập Excel hàng loạt
// (POST /api/goods-receipts/import, mỗi nhóm dòng cùng NCC+ngày hàng về tạo 1 GoodsReceipt riêng). LUÔN
// gọi trong 1 transaction của nơi gọi (không tự mở transaction ở đây) để nhập Excel nhiều nhóm vẫn atomic
// theo đúng convention "không ghi gì nếu có dòng lỗi" của các route nhập Excel khác.
export async function createPlannedGoodsReceipt(
  tx: Prisma.TransactionClient,
  params: {
    supplierId: string;
    roomId: string;
    createdById: string;
    notes?: string;
    expectedDate: Date;
    items: { plantTypeId: string; plantTypeCode: string; stageCode: string; estimatedQuantity: number }[];
    staffCode: string;
  }
) {
  const { supplierId, roomId, createdById, notes, expectedDate, items, staffCode } = params;
  const code = await generateGoodsReceiptCode(tx);
  const created = await tx.goodsReceipt.create({
    data: { code, supplierId, roomId, createdById, notes, status: "PLANNED", expectedDate },
  });

  for (const item of items) {
    const lotCode = await generateLotCode({ plantTypeCode: item.plantTypeCode, staffCode, stageCode: item.stageCode, date: expectedDate, client: tx });
    const plannedLot = await tx.lot.create({
      data: {
        code: lotCode,
        plantTypeId: item.plantTypeId,
        stage: "THANH_PHAM",
        stageCode: item.stageCode,
        roomId,
        quantity: item.estimatedQuantity,
        initialQuantity: item.estimatedQuantity,
        status: "PLANNED",
        expectedDate,
      },
    });
    await tx.goodsReceiptItem.create({
      data: {
        receiptId: created.id,
        plantTypeId: item.plantTypeId,
        stageCode: item.stageCode,
        quantityDelivered: item.estimatedQuantity,
        quantityRejected: 0,
        quantityPassed: item.estimatedQuantity,
        plannedLotId: plannedLot.id,
      },
    });
  }

  return created;
}
