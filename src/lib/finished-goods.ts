import type { Prisma, RoomType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Client = Prisma.TransactionClient | typeof prisma;

// Các loại phòng thuộc kho thành phẩm dùng cho đề xuất Trồng/Hủy + luồng "Thực hiện" nhiệm vụ ngày — dùng
// chung giữa POST /api/contamination-proposals, /contamination-proposals/page.tsx và
// /task-assignment/de-xuat/[taskId]/page.tsx. Kho thành phẩm chỉ còn Phòng đạt tiêu chuẩn + Phòng chờ
// xử lý (+ Phòng thị trường nếu Admin thêm) — Phòng theo dõi/hàn túi đã bỏ.
export const FINISHED_GOODS_ROOM_TYPES: RoomType[] = ["PHONG_DAT_TIEU_CHUAN", "PHONG_CHO_XU_LY", "PHONG_THI_TRUONG"];

// Phòng NV Kho thành phẩm kiểm tra trong "Kiểm tra kho cây theo tuần" — không gồm Phòng chờ xử lý (đó là
// nơi hàng không đạt được chuyển VỀ, Quản lý kho thành phẩm xử lý tiếp ở nhiệm vụ tuần của mình).
export const WEEKLY_CHECK_ROOM_TYPES: RoomType[] = ["PHONG_DAT_TIEU_CHUAN", "PHONG_THI_TRUONG"];

export class InsufficientRoomStockError extends Error {}

// Phòng chờ xử lý (đang hoạt động) của 1 kho thành phẩm — null nếu Admin chưa tạo.
export async function getProcessingRoom(warehouseId: string, client: Client = prisma) {
  return client.room.findFirst({
    where: { warehouseId, type: "PHONG_CHO_XU_LY", isActive: true },
    select: { id: true, code: true, name: true, warehouseId: true },
  });
}

// Trừ `quantity` cây (plantTypeId + stageCode) khỏi các lô ACTIVE của 1 phòng, lô cũ trước (FIFO) — kho
// thành phẩm có thể có nhiều lô cùng mã cây/quy cách trong 1 phòng. Ném InsufficientRoomStockError nếu
// tổng tồn không đủ (đọc lại trong chính transaction, không tin số client đã xem).
export async function deductFromRoomFifo(
  tx: Prisma.TransactionClient,
  roomId: string,
  plantTypeId: string,
  stageCode: string,
  quantity: number,
  label: string
): Promise<void> {
  if (quantity <= 0) return;
  const lots = await tx.lot.findMany({
    where: { roomId, plantTypeId, stageCode, status: "ACTIVE", quantity: { gt: 0 } },
    orderBy: { enteredAt: "asc" },
    select: { id: true, quantity: true },
  });
  const total = lots.reduce((sum, l) => sum + l.quantity, 0);
  if (total < quantity) {
    throw new InsufficientRoomStockError(`${label}: không đủ tồn (còn ${total.toLocaleString("vi-VN")}, cần ${quantity.toLocaleString("vi-VN")})`);
  }
  let remaining = quantity;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
    remaining -= take;
  }
}
