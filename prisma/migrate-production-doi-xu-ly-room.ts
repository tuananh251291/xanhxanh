// Chạy 1 lần sau khi deploy schema có RoomType.PHONG_DOI_XU_LY (idempotent):
//   npx tsx --env-file=.env prisma/migrate-production-doi-xu-ly-room.ts
// Mỗi kho sản xuất đang hoạt động: tạo "Phòng đợi xử lý" (<mã kho>-DXL) + 1 giàn (<mã kho>-DXL-G01) nếu chưa có.
import { prisma } from "../src/lib/prisma";

async function main() {
  const warehouses = await prisma.warehouse.findMany({ where: { type: "SAN_XUAT", isActive: true }, select: { id: true, code: true } });
  for (const w of warehouses) {
    let room = await prisma.room.findFirst({ where: { warehouseId: w.id, type: "PHONG_DOI_XU_LY" }, select: { id: true, code: true } });
    if (!room) {
      room = await prisma.room.create({
        data: { code: `${w.code}-DXL`, name: "Phòng đợi xử lý", type: "PHONG_DOI_XU_LY", warehouseId: w.id },
        select: { id: true, code: true },
      });
      console.log(`${w.code}: tạo ${room.code}`);
    } else {
      console.log(`${w.code}: đã có ${room.code}`);
    }
    const shelfCount = await prisma.shelf.count({ where: { roomId: room.id } });
    if (shelfCount === 0) {
      const shelf = await prisma.shelf.create({ data: { code: `${w.code}-DXL-G01`, name: "Giàn đợi xử lý 01", warehouseId: w.id, roomId: room.id } });
      console.log(`  tạo giàn ${shelf.code}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
