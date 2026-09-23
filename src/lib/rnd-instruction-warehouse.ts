import { prisma } from "@/lib/prisma";
import { generateWarehouseCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import type { Prisma, Warehouse, Shelf } from "@prisma/client";

// "Kho SX R&D" — kho sản xuất (type SAN_XUAT) riêng cho Admin kỹ thuật tự tạo chỉ định cấy cho mình
// (xem POST /api/rnd-production/instructions). CHỈ có Phòng tối (mỗi Admin kỹ thuật 1 phòng riêng, giống
// hệt Phòng tối cá nhân của NV cấy mô thường) + Phòng nhiễm khi phát sinh nhiễm — KHÔNG có Phòng mẫu
// mẹ/Phòng ra rễ (kho sáng, sửa 23/09/2026): trước đây có 2 phòng này chỉ để làm "điểm neo kỹ thuật" cho
// 1 kệ ẩn dùng chung toàn kho (getOrCreateRndInputShelf/OutputShelf) — lô neo đó LUÔN ở trạng thái PLANTED
// ngay khi tạo, không phải tồn thật, còn TOÀN BỘ tồn thật (mẫu mẹ Admin kỹ thuật tự khai, thành phẩm nhập
// dữ liệu cấy ra) đã luôn nằm ở Phòng tối cá nhân của người đó rồi (giống NV cấy mô thường) — 2 phòng kho
// sáng chỉ gây hiểu nhầm R&D có tồn ở đó. Nay kệ neo cũng nằm thẳng trong Phòng tối của ĐÚNG Admin kỹ
// thuật đang thao tác (mỗi người 1 kệ neo riêng, không dùng chung nữa) — vẫn cần 1 Shelf (không dùng
// roomId trực tiếp) vì PlantingInstructionItem.shelfId bắt buộc có giá trị.
// isRnd đánh dấu để tra cứu đáng tin cậy, không so tên chuỗi (xem Warehouse.isRnd, schema.prisma).
const RND_WAREHOUSE_NAME = "Kho SX R&D";
const RND_INPUT_SHELF_SUFFIX = "PS-BUCKET";
const RND_OUTPUT_SHELF_SUFFIX = "PRR-BUCKET";

export async function getOrCreateRndWarehouse(
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Warehouse> {
  const existing = await client.warehouse.findFirst({ where: { isRnd: true } });
  if (existing) return existing;

  const code = await generateWarehouseCode("SAN_XUAT");
  // KHÔNG gọi createDefaultProductionRooms (Phòng mẫu mẹ/Phòng ra rễ/Phòng nhiễm) — R&D không có kho
  // sáng, Phòng nhiễm tự tạo lazy khi phát sinh nhiễm (getOrCreateContaminationRoom), Phòng tối tự tạo
  // lazy theo từng Admin kỹ thuật (getOrCreatePersonalDarkRoom, xem getOrCreateRndBucketShelf bên dưới).
  return client.warehouse.create({
    data: { code, name: RND_WAREHOUSE_NAME, type: "SAN_XUAT", isRnd: true },
  });
}

async function getOrCreateRndBucketShelf(
  warehouseId: string,
  staffId: string,
  suffix: string,
  name: string,
  client: Prisma.TransactionClient | typeof prisma
): Promise<Shelf> {
  const [warehouse, staff] = await Promise.all([
    client.warehouse.findUniqueOrThrow({ where: { id: warehouseId } }),
    client.user.findUniqueOrThrow({ where: { id: staffId }, select: { code: true } }),
  ]);
  // Mỗi Admin kỹ thuật 1 kệ neo riêng (khác trước đây dùng chung 1 kệ cho cả kho) — mã kệ nhúng cả mã NV
  // để không đụng nhau khi nhiều Admin kỹ thuật cùng dùng R&D.
  const shelfCode = `${warehouse.code}-${staff.code}-${suffix}`;

  const existing = await client.shelf.findUnique({ where: { code: shelfCode } });
  if (existing) return existing;

  const room = await getOrCreatePersonalDarkRoom(staffId, warehouseId);
  return client.shelf.create({ data: { code: shelfCode, name, warehouseId, roomId: room.id } });
}

// Kệ ẩn trong Phòng tối của ĐÚNG Admin kỹ thuật — nơi chứa mọi Lot mẫu mẹ (M05) người đó tự khai (tạo
// chỉ định cấy hoặc bàn giao trực tiếp), không hiện khái niệm "chọn kệ" ở UI.
export async function getOrCreateRndInputShelf(
  warehouseId: string,
  staffId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Shelf> {
  return getOrCreateRndBucketShelf(warehouseId, staffId, RND_INPUT_SHELF_SUFFIX, "Kệ mẫu mẹ R&D (ẩn)", client);
}

// Kệ ẩn trong Phòng tối của ĐÚNG Admin kỹ thuật — nơi chứa mọi Lot thành phẩm (T05/T01) người đó tự khai
// lúc bàn giao trực tiếp (xem sendRndOutputToWarehouse, src/lib/rnd-warehouse-handover.ts).
export async function getOrCreateRndOutputShelf(
  warehouseId: string,
  staffId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Shelf> {
  return getOrCreateRndBucketShelf(warehouseId, staffId, RND_OUTPUT_SHELF_SUFFIX, "Kệ ra rễ R&D (ẩn)", client);
}
