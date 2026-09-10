import { prisma } from "@/lib/prisma";
import { generateWarehouseCode } from "@/lib/codes";
import { createDefaultProductionRooms } from "@/lib/warehouse-provisioning";
import type { Prisma, Warehouse, Shelf } from "@prisma/client";

// "Kho SX R&D" — kho sản xuất (type SAN_XUAT) riêng cho Admin kỹ thuật tự tạo chỉ định cấy cho mình
// (xem POST /api/rnd-production/instructions). Giống hệt mọi kho sản xuất khác (đủ 3 phòng mặc định,
// xem createDefaultProductionRooms) để đi qua được nguyên vẹn mọi ràng buộc/luồng thật hiện có (chỉ
// định cấy, nhật ký cấy, bàn giao...) — CHỈ khác ở chỗ Admin kỹ thuật không bao giờ tự chia giàn kệ:
// hệ thống tự tạo ngầm đúng 1 kệ "bucket" duy nhất trong Phòng mẫu mẹ (getOrCreateRndInputShelf) làm nơi
// chứa mọi Lot mẫu mẹ mà Admin kỹ thuật tự khai khi tạo chỉ định — không hiện khái niệm "chọn kệ" ở UI.
// isRnd đánh dấu để tra cứu đáng tin cậy, không so tên chuỗi (xem Warehouse.isRnd, schema.prisma).
const RND_WAREHOUSE_NAME = "Kho SX R&D";
const RND_BUCKET_SHELF_SUFFIX = "PS-BUCKET";

export async function getOrCreateRndWarehouse(
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Warehouse> {
  const existing = await client.warehouse.findFirst({ where: { isRnd: true } });
  if (existing) return existing;

  const code = await generateWarehouseCode("SAN_XUAT");
  const warehouse = await client.warehouse.create({
    data: { code, name: RND_WAREHOUSE_NAME, type: "SAN_XUAT", isRnd: true },
  });
  await createDefaultProductionRooms(warehouse.id, code, client);
  return warehouse;
}

export async function getOrCreateRndInputShelf(
  warehouseId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Shelf> {
  const warehouse = await client.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
  const shelfCode = `${warehouse.code}-${RND_BUCKET_SHELF_SUFFIX}`;

  const existing = await client.shelf.findUnique({ where: { code: shelfCode } });
  if (existing) return existing;

  const motherRoom = await client.room.findFirstOrThrow({ where: { warehouseId, type: "PHONG_MAU_ME" } });
  return client.shelf.create({
    data: { code: shelfCode, name: "Kệ mẫu mẹ R&D (ẩn)", warehouseId, roomId: motherRoom.id },
  });
}
