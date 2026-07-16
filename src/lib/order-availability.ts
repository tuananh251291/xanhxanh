import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient | typeof prisma;

// Danh sách phòng 1 NV Sale được xem tồn — Phòng khả dụng của kho thành phẩm được gán làm việc
// (workplaceWarehouseId) + mọi Phòng thị trường đã được Admin cấp quyền riêng (RoomAccess). Dùng chung
// cho trang "Xem tồn khả dụng" lẫn "Check đơn hàng"/"Tạm giữ đơn hàng" để luôn cùng 1 phạm vi tồn kho.
export async function getAccessibleRoomIds(
  userId: string,
  workplaceWarehouseId: string | null,
  client: Client = prisma
): Promise<string[]> {
  const [homeRoom, marketRooms] = await Promise.all([
    workplaceWarehouseId
      ? client.room.findFirst({
          where: { warehouseId: workplaceWarehouseId, type: "PHONG_KHA_DUNG", isActive: true },
          select: { id: true },
        })
      : null,
    client.room.findMany({
      where: { type: "PHONG_THI_TRUONG", isActive: true, roomAccess: { some: { userId } } },
      select: { id: true },
    }),
  ]);
  return [...(homeRoom ? [homeRoom.id] : []), ...marketRooms.map((r) => r.id)];
}

// Suy ra "cỡ túi" từ số trong mã quy cách (VD "T05" -> 5, "T01" -> 1, "T10" -> 10 nếu sau này có thêm)
// — dùng để ưu tiên đề xuất quy cách thay thế từ túi lớn nhất trước khi tồn đúng quy cách yêu cầu
// không đủ. Không hard-code danh sách quy cách cụ thể để tự hỗ trợ quy cách mới nếu có sau này.
export function parseBagSize(stageCode: string): number {
  const match = stageCode.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// Lô ACTIVE của 1 (plantTypeId, stageCode?) trong danh sách phòng cho trước, đã trừ tổng OrderItem của
// các đơn đang HELD hoặc CONFIRMED (đều chưa xuất kho, vẫn coi là đang giữ chỗ — giống công thức
// getAvailableQuantity ở src/lib/inventory.ts nhưng tính hàng loạt theo lô thay vì 1 lô/lần) — sắp theo
// enteredAt tăng dần (FIFO) để ưu tiên phân bổ lô cũ trước khi tạo đơn. Chỉ trả lô còn tồn khả dụng > 0.
export async function getAvailableLots(
  roomIds: string[],
  plantTypeId: string,
  stageCode?: string,
  client: Client = prisma
): Promise<{ id: string; roomId: string; stageCode: string; available: number }[]> {
  if (roomIds.length === 0) return [];
  const lots = await client.lot.findMany({
    where: { roomId: { in: roomIds }, plantTypeId, status: "ACTIVE", ...(stageCode ? { stageCode } : {}) },
    select: {
      id: true,
      roomId: true,
      stageCode: true,
      quantity: true,
      // Dòng đã có Yêu cầu xử lý COMPLETED thì tồn thực đã bị trừ thật (xem PATCH
      // /api/order-processing-requests/[id]) — loại khỏi tổng trừ HELD-netting để không trừ đôi.
      orderItems: {
        where: {
          order: { status: { in: ["HELD", "CONFIRMED"] } },
          OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
        },
        select: { quantity: true },
      },
    },
    orderBy: { enteredAt: "asc" },
  });
  return lots
    .map((l) => ({
      id: l.id,
      roomId: l.roomId!,
      stageCode: l.stageCode,
      available: l.quantity - l.orderItems.reduce((s, i) => s + i.quantity, 0),
    }))
    .filter((l) => l.available > 0);
}
