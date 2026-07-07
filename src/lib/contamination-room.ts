import { prisma } from "@/lib/prisma";
import type { Prisma, PlantStage } from "@prisma/client";

// Phòng nhiễm — 1 phòng/kho sản xuất, đã seed sẵn (xem prisma/seed.ts, code "{warehouseCode}-NHIEM").
// Chỉ tạo mới ở đây cho trường hợp kho được tạo sau khi seed và chưa có phòng này.
export async function getOrCreateContaminationRoom(warehouseId: string) {
  const existing = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
  if (existing) return existing;

  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
  const code = `${warehouse?.code ?? warehouseId.slice(0, 6)}-NHIEM`;

  return prisma.room.create({
    data: { code, name: "Phòng nhiễm", type: "PHONG_NHIEM", warehouseId },
  });
}

// Cộng dồn số lượng nhiễm vào Phòng nhiễm của đúng kho, gộp theo (mã sản phẩm, quy cách) — không phân
// biệt lô/NV cấy mô nào báo. Mã lô gộp nhúng cả mã kho lẫn mã cây vì Lot chỉ unique theo (code, stageCode)
// trên TOÀN bảng (không scope theo kho), nên phải tự tách để 2 kho sản xuất không đụng mã.
export async function addToContaminationRoom(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    warehouseId: string;
    warehouseCode: string;
    plantTypeId: string;
    plantTypeCode: string;
    stage: PlantStage;
    stageCode: string;
    quantity: number;
  },
) {
  if (params.quantity <= 0) return;

  const room = await getOrCreateContaminationRoom(params.warehouseId);
  const code = `NHIEM-${params.warehouseCode}-${params.plantTypeCode}`;

  const existingLot = await client.lot.findFirst({
    where: { roomId: room.id, code, stageCode: params.stageCode },
  });

  if (existingLot) {
    await client.lot.update({
      where: { id: existingLot.id },
      data: { quantity: { increment: params.quantity }, initialQuantity: { increment: params.quantity } },
    });
  } else {
    await client.lot.create({
      data: {
        code,
        plantTypeId: params.plantTypeId,
        stage: params.stage,
        stageCode: params.stageCode,
        roomId: room.id,
        quantity: params.quantity,
        initialQuantity: params.quantity,
        status: "ACTIVE",
      },
    });
  }
}
