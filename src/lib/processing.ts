import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

type Client = Prisma.TransactionClient | typeof prisma;

// NV kho thành phẩm có thể được gán workplaceWarehouseId (chỉ mang tính hiển thị/lưu trữ, xem
// src/app/api/users/[id]/route.ts) nhưng field đó KHÔNG được dùng để lọc ở đây — NV kho thành phẩm
// vẫn thao tác trên mọi Phòng khả dụng của mọi kho thành phẩm, tự chọn phòng khi tạo phiếu xử lý thay
// vì có sẵn 1 "phòng nhà" mặc định như Sale.
export async function getFinishedAvailableRooms(client: Client = prisma) {
  return client.room.findMany({
    where: { type: "PHONG_KHA_DUNG", isActive: true, warehouse: { type: "THANH_PHAM" } },
    select: { id: true, code: true, name: true, warehouse: { select: { code: true, name: true } } },
    orderBy: [{ warehouse: { name: "asc" } }, { name: "asc" }],
  });
}
