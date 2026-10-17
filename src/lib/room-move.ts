import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getReservedForHandover } from "@/lib/finished-goods";

type Client = Prisma.TransactionClient | typeof prisma;

// "Luân chuyển nội bộ" Kho thành phẩm — Phòng đạt tiêu chuẩn ⇄ Phòng chờ xử lý (xem POST /api/room-moves).
export type RoomMoveDirection = "TO_PROCESSING" | "TO_STANDARD";

export async function getRoomMoveRooms(warehouseId: string, client: Client = prisma) {
  const [standardRoom, processingRoom] = await Promise.all([
    client.room.findFirst({ where: { warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    client.room.findFirst({ where: { warehouseId, type: "PHONG_CHO_XU_LY", isActive: true }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
  ]);
  return { standardRoom, processingRoom };
}

// Đơn HELD/CONFIRMED đang giữ chỗ trên lô (trừ dòng đã có Yêu cầu xử lý COMPLETED — tồn thực đã trừ thật),
// khớp công thức getQualifiedLots (src/lib/order-availability.ts).
const heldOrderItemsWhere: Prisma.OrderItemWhereInput = {
  order: { status: { in: ["HELD", "CONFIRMED"] } },
  OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
};

export type MovableLot = { id: string; plantTypeId: string; stageCode: string; available: number };

// Từng lô còn chuyển được trong phòng nguồn, FIFO (lô cũ trước):
// - Phòng đạt tiêu chuẩn: tồn lô − phần đơn HELD/CONFIRMED đang giữ trên CHÍNH lô đó (không được rút hàng
//   đã hứa cho đơn, nếu không lúc xuất kho sẽ thiếu).
// - Phòng chờ xử lý: tồn − phần đã giữ chỗ cho Phiếu xử lý chưa bàn giao (theo mã cây + quy cách, trừ dần
//   từ lô mới nhất để phần còn lại vẫn lấy FIFO).
export async function getMovableLots(roomId: string, isStandardRoom: boolean, client: Client = prisma): Promise<MovableLot[]> {
  const lots = await client.lot.findMany({
    where: { roomId, status: "ACTIVE", quantity: { gt: 0 } },
    orderBy: { enteredAt: "asc" },
    select: {
      id: true, plantTypeId: true, stageCode: true, quantity: true,
      ...(isStandardRoom ? { orderItems: { where: heldOrderItemsWhere, select: { quantity: true } } } : {}),
    },
  });
  if (isStandardRoom) {
    return lots
      .map((l) => {
        const held = ((l as { orderItems?: { quantity: number }[] }).orderItems ?? []).reduce((s, i) => s + i.quantity, 0);
        return { id: l.id, plantTypeId: l.plantTypeId, stageCode: l.stageCode, available: l.quantity - held };
      })
      .filter((l) => l.available > 0);
  }
  const reserved = await getReservedForHandover(roomId, client);
  const result = lots.map((l) => ({ id: l.id, plantTypeId: l.plantTypeId, stageCode: l.stageCode, available: l.quantity }));
  for (const [key, qty] of reserved) {
    let remaining = qty;
    for (let i = result.length - 1; i >= 0 && remaining > 0; i--) {
      const l = result[i];
      if (`${l.plantTypeId}:${l.stageCode}` !== key) continue;
      const take = Math.min(l.available, remaining);
      l.available -= take;
      remaining -= take;
    }
  }
  return result.filter((l) => l.available > 0);
}

// Gộp theo mã cây + quy cách — dùng cho danh sách chọn ở form.
export function summarizeMovable(lots: MovableLot[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of lots) map.set(`${l.plantTypeId}:${l.stageCode}`, (map.get(`${l.plantTypeId}:${l.stageCode}`) ?? 0) + l.available);
  return map;
}
