// Chạy sau khi deploy schema có RoomType.PHONG_DOI_XU_LY (idempotent):
//   npx tsx --env-file=.env prisma/migrate-production-doi-xu-ly-room.ts
// Mỗi kho sản xuất đang hoạt động: tạo "Phòng đợi xử lý" (<mã kho>-DXL) nếu chưa có. Phòng này KHÔNG có
// giàn kệ (lô gắn thẳng vào phòng, giống phòng nhiễm cá nhân) — xoá các giàn đã lỡ tạo trong phòng (chỉ khi
// giàn chưa từng có lô nào).
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
    const shelves = await prisma.shelf.findMany({ where: { roomId: room.id }, select: { id: true, code: true, _count: { select: { lots: true } } } });
    for (const s of shelves) {
      if (s._count.lots > 0) {
        console.warn(`  giàn ${s.code} đã có lô — KHÔNG xoá, xử lý tay`);
        continue;
      }
      await prisma.shelf.delete({ where: { id: s.id } });
      console.log(`  xoá giàn ${s.code}`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
