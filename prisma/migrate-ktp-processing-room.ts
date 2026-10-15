// Chạy 1 lần sau khi deploy schema có RoomType.PHONG_CHO_XU_LY (idempotent — chạy lại không sao):
//   npx tsx --env-file=.env prisma/migrate-ktp-processing-room.ts
// Mỗi kho thành phẩm: tạo "Phòng chờ xử lý" (<mã kho>-CXL) nếu chưa có; tắt Phòng theo dõi/Phòng hàn túi
// (chỉ khi phòng đó không còn tồn > 0 — còn tồn thì in cảnh báo, bỏ qua để xử lý tay).
import { prisma } from "../src/lib/prisma";

async function main() {
  const warehouses = await prisma.warehouse.findMany({ where: { type: "THANH_PHAM" }, select: { id: true, code: true, name: true } });
  for (const w of warehouses) {
    const existing = await prisma.room.findFirst({ where: { warehouseId: w.id, type: "PHONG_CHO_XU_LY" } });
    if (existing) {
      if (!existing.isActive) await prisma.room.update({ where: { id: existing.id }, data: { isActive: true } });
      console.log(`${w.code}: đã có ${existing.code}`);
    } else {
      const room = await prisma.room.create({
        data: { code: `${w.code}-CXL`, name: "Phòng chờ xử lý", type: "PHONG_CHO_XU_LY", warehouseId: w.id },
      });
      console.log(`${w.code}: tạo ${room.code}`);
    }

    const oldRooms = await prisma.room.findMany({
      where: { warehouseId: w.id, type: { in: ["PHONG_THEO_DOI", "PHONG_HAN_TUI"] }, isActive: true },
      select: { id: true, code: true },
    });
    for (const r of oldRooms) {
      const stock = await prisma.lot.aggregate({ where: { roomId: r.id, status: "ACTIVE", quantity: { gt: 0 } }, _sum: { quantity: true } });
      if ((stock._sum.quantity ?? 0) > 0) {
        console.warn(`${r.code}: còn ${stock._sum.quantity} cây — KHÔNG tắt, chuyển hàng trước rồi chạy lại`);
        continue;
      }
      await prisma.room.update({ where: { id: r.id }, data: { isActive: false } });
      console.log(`${r.code}: đã tắt`);
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => process.exit(0));
