import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Dùng cho POST /api/warehouses lúc Admin cấp cao tạo 1 kho sản xuất THƯỜNG mới — 3 phòng mặc định mọi
// kho sản xuất thường đều có (Phòng mẫu mẹ/ra rễ/nhiễm), CHƯA tạo giàn kệ. Phòng tối cá nhân không tạo ở
// đây — tự sinh riêng theo từng NV khi được gán làm việc tại kho (xem lib/dark-room.ts). KHÔNG dùng cho
// getOrCreateRndWarehouse (src/lib/rnd-instruction-warehouse.ts) — Kho SX R&D chỉ có Phòng tối, không có
// Phòng mẫu mẹ/ra rễ (sửa 23/09/2026, xem comment ở đó).
export async function createDefaultProductionRooms(
  warehouseId: string,
  code: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  await client.room.createMany({
    data: [
      { code: `${code}-PS`, name: "Phòng mẫu mẹ", type: "PHONG_MAU_ME", warehouseId },
      { code: `${code}-PRR`, name: "Phòng ra rễ", type: "PHONG_RA_RE", warehouseId },
      { code: `${code}-DXL`, name: "Phòng đợi xử lý", type: "PHONG_DOI_XU_LY", warehouseId },
      { code: `${code}-NHIEM`, name: "Phòng nhiễm", type: "PHONG_NHIEM", warehouseId },
    ],
  });
  // Phòng đợi xử lý có sẵn 1 giàn — Admin thêm giàn sau ở Quản lý kho nếu cần.
  const doiXuLy = await client.room.findFirst({ where: { warehouseId, type: "PHONG_DOI_XU_LY" }, select: { id: true } });
  if (doiXuLy) {
    await client.shelf.create({ data: { code: `${code}-DXL-G01`, name: "Giàn đợi xử lý 01", warehouseId, roomId: doiXuLy.id } });
  }
}
