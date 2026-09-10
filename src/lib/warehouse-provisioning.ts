import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Tách khỏi POST /api/warehouses để dùng lại được cho getOrCreateRndWarehouse
// (src/lib/rnd-instruction-warehouse.ts) — cùng 3 phòng mặc định mọi kho sản xuất đều có (Phòng mẫu
// mẹ/ra rễ/nhiễm), CHƯA tạo giàn kệ. Phòng tối cá nhân không tạo ở đây — tự sinh riêng theo từng NV khi
// được gán làm việc tại kho (xem lib/dark-room.ts).
export async function createDefaultProductionRooms(
  warehouseId: string,
  code: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await client.room.createMany({
    data: [
      { code: `${code}-PS`, name: "Phòng mẫu mẹ", type: "PHONG_MAU_ME", warehouseId },
      { code: `${code}-PRR`, name: "Phòng ra rễ", type: "PHONG_RA_RE", warehouseId },
      { code: `${code}-NHIEM`, name: "Phòng nhiễm", type: "PHONG_NHIEM", warehouseId },
    ],
  });
}
