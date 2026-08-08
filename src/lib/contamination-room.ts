import { prisma } from "@/lib/prisma";
import type { Prisma, PlantStage, ContaminationEntryReason } from "@prisma/client";

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

// Ghi 1 dòng lịch sử vào ContaminationRoomEntry — dùng chung cho addToContaminationRoom (cộng mới) LẪN
// nơi tự tính tay việc tăng/giảm Phòng nhiễm (xem PATCH /api/daily-records/[id], vẫn giữ logic merge lô
// riêng vì có thêm bước chặn "không đủ để trừ lại", chỉ gọi hàm này để log). quantity có thể ÂM (điều
// chỉnh giảm) — bỏ qua nếu bằng 0 (không có gì để ghi).
export async function logContaminationRoomEntry(
  client: Prisma.TransactionClient | typeof prisma,
  params: {
    contaminationLotId: string;
    quantity: number;
    sourceLotId?: string | null;
    sourceLotCode?: string | null;
    reportedById: string;
    reason: ContaminationEntryReason;
  },
) {
  if (params.quantity === 0) return;
  await client.contaminationRoomEntry.create({
    data: {
      contaminationLotId: params.contaminationLotId,
      quantity: params.quantity,
      sourceLotId: params.sourceLotId ?? null,
      sourceLotCode: params.sourceLotCode ?? null,
      reportedById: params.reportedById,
      reason: params.reason,
    },
  });
}

// Cộng dồn số lượng nhiễm vào Phòng nhiễm của đúng kho, gộp theo (mã sản phẩm, quy cách) — không phân
// biệt lô/NV cấy mô nào báo (xem Lot.code = "NHIEM-{maKho}-{maCay}"). Mã lô gộp nhúng cả mã kho lẫn mã
// cây vì Lot chỉ unique theo (code, stageCode) trên TOÀN bảng (không scope theo kho), nên phải tự tách
// để 2 kho sản xuất không đụng mã. Mỗi lần gọi cũng ghi 1 dòng ContaminationRoomEntry (xem
// logContaminationRoomEntry) để truy vết được TỪNG LẦN báo nhiễm cụ thể, dù Lot chỉ lưu số gộp.
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
    reportedById: string;
    reason: ContaminationEntryReason;
    sourceLotId?: string | null;
    sourceLotCode?: string | null;
  },
) {
  if (params.quantity <= 0) return;

  const room = await getOrCreateContaminationRoom(params.warehouseId);
  const code = `NHIEM-${params.warehouseCode}-${params.plantTypeCode}`;

  const existingLot = await client.lot.findFirst({
    where: { roomId: room.id, code, stageCode: params.stageCode },
  });

  let contaminationLotId: string;
  if (existingLot) {
    await client.lot.update({
      where: { id: existingLot.id },
      data: { quantity: { increment: params.quantity }, initialQuantity: { increment: params.quantity } },
    });
    contaminationLotId = existingLot.id;
  } else {
    const created = await client.lot.create({
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
    contaminationLotId = created.id;
  }

  await logContaminationRoomEntry(client, {
    contaminationLotId,
    quantity: params.quantity,
    sourceLotId: params.sourceLotId,
    sourceLotCode: params.sourceLotCode,
    reportedById: params.reportedById,
    reason: params.reason,
  });
}
