import type { Prisma } from "@prisma/client";
import { generateLotCode } from "@/lib/codes";

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
  const code = await generateLotCode({ plantTypeCode, staffCode, stageCode });
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
