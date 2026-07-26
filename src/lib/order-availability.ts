import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient | typeof prisma;

// Danh sách phòng 1 NV Sale được xem tồn — Phòng đạt tiêu chuẩn của kho thành phẩm được gán làm việc
// (workplaceWarehouseId) + mọi Phòng thị trường đã được Admin cấp quyền riêng (RoomAccess). Dùng chung
// cho trang "Xem tồn đạt tiêu chuẩn" lẫn "Check đơn hàng"/"Tạm giữ đơn hàng" để luôn cùng 1 phạm vi tồn kho.
export async function getAccessibleRoomIds(
  userId: string,
  workplaceWarehouseId: string | null,
  client: Client = prisma
): Promise<string[]> {
  const [homeRoom, marketRooms] = await Promise.all([
    workplaceWarehouseId
      ? client.room.findFirst({
          where: { warehouseId: workplaceWarehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true },
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

// Phòng hàn túi + Phòng theo dõi của kho thành phẩm được gán làm việc — dùng làm tầng dự phòng cuối
// (tier 3, sau Phòng đạt tiêu chuẩn đúng quy cách rồi thay thế) khi vẫn thiếu hàng, xem orders/check và
// orders (POST). Không tính Phòng thị trường vì hàn túi/theo dõi chỉ tồn tại theo từng kho thành phẩm vật
// lý cụ thể, không có khái niệm "kho thị trường hàn túi" riêng.
export async function getInProgressRoomIds(
  workplaceWarehouseId: string | null,
  client: Client = prisma
): Promise<string[]> {
  if (!workplaceWarehouseId) return [];
  const rooms = await client.room.findMany({
    where: { warehouseId: workplaceWarehouseId, type: { in: ["PHONG_HAN_TUI", "PHONG_THEO_DOI"] }, isActive: true },
    select: { id: true },
  });
  return rooms.map((r) => r.id);
}

// Suy ra "cỡ túi" từ số trong mã quy cách (VD "T05" -> 5, "T01" -> 1, "T10" -> 10 nếu sau này có thêm)
// — dùng để ưu tiên đề xuất quy cách thay thế từ túi lớn nhất trước khi tồn đúng quy cách yêu cầu
// không đủ. Không hard-code danh sách quy cách cụ thể để tự hỗ trợ quy cách mới nếu có sau này.
export function parseBagSize(stageCode: string): number {
  const match = stageCode.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

// Lô ACTIVE (+ lô PLANNED nếu truyền opts.shipDate) của 1 (plantTypeId, stageCode?) trong danh sách
// phòng cho trước, đã trừ tổng OrderItem của các đơn đang HELD hoặc CONFIRMED (đều chưa xuất kho, vẫn
// coi là đang giữ chỗ — giống công thức getAvailableQuantity ở src/lib/inventory.ts nhưng tính hàng loạt
// theo lô thay vì 1 lô/lần) — sắp theo enteredAt tăng dần (FIFO) để ưu tiên phân bổ lô cũ trước khi tạo
// đơn. Chỉ trả lô còn tồn đạt tiêu chuẩn > 0.
//
// opts.shipDate (ngày xuất dự kiến của 1 đơn hàng cụ thể) — nếu truyền, nối thêm các lô "ảo"
// (status PLANNED, tạo từ 1 Kế hoạch nhập kho — xem POST /api/goods-receipts) có expectedDate <=
// shipDate vào SAU danh sách lô ACTIVE (ưu tiên tồn thật trước, dự kiến sau), sắp theo expectedDate tăng
// dần. Không truyền opts = giữ nguyên hành vi cũ (chỉ tồn thật) cho các nơi gọi chưa cần biết ngày xuất.
export async function getQualifiedLots(
  roomIds: string[],
  plantTypeId: string,
  stageCode?: string,
  client: Client = prisma,
  opts?: { shipDate?: Date }
): Promise<{ id: string; roomId: string; stageCode: string; available: number; planned?: boolean; expectedDate?: Date }[]> {
  if (roomIds.length === 0) return [];

  const netAvailable = (l: { quantity: number; orderItems: { quantity: number }[] }) =>
    l.quantity - l.orderItems.reduce((s, i) => s + i.quantity, 0);
  // Dòng đã có Yêu cầu xử lý COMPLETED thì tồn thực đã bị trừ thật (xem PATCH
  // /api/order-processing-requests/[id]) — loại khỏi tổng trừ HELD-netting để không trừ đôi.
  const orderItemsWhere: Prisma.OrderItemWhereInput = {
    order: { status: { in: ["HELD", "CONFIRMED"] } },
    OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
  };

  const activeLots = await client.lot.findMany({
    where: { roomId: { in: roomIds }, plantTypeId, status: "ACTIVE", ...(stageCode ? { stageCode } : {}) },
    select: {
      id: true, roomId: true, stageCode: true, quantity: true,
      orderItems: { where: orderItemsWhere, select: { quantity: true } },
    },
    orderBy: { enteredAt: "asc" },
  });
  const result = activeLots
    .map((l) => ({ id: l.id, roomId: l.roomId!, stageCode: l.stageCode, available: netAvailable(l) }))
    .filter((l) => l.available > 0);

  if (opts?.shipDate) {
    const plannedLots = await client.lot.findMany({
      where: {
        roomId: { in: roomIds }, plantTypeId, status: "PLANNED", ...(stageCode ? { stageCode } : {}),
        expectedDate: { lte: opts.shipDate },
      },
      select: {
        id: true, roomId: true, stageCode: true, quantity: true, expectedDate: true,
        orderItems: { where: orderItemsWhere, select: { quantity: true } },
      },
      orderBy: { expectedDate: "asc" },
    });
    result.push(
      ...plannedLots
        .map((l) => ({ id: l.id, roomId: l.roomId!, stageCode: l.stageCode, available: netAvailable(l), planned: true, expectedDate: l.expectedDate! }))
        .filter((l) => l.available > 0)
    );
  }

  return result;
}
