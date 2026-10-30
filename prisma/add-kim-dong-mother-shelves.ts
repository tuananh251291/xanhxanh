import { prisma } from "../src/lib/prisma";

// Thêm giàn kệ Phòng mẫu mẹ Kho sản xuất Kim Động (SX-F-PS): giàn P01–P09, Q01–Q09, T01–T07, J01–J07, O01–O08,
// N01–N08, R01–R08, S01–S05; mỗi giàn C01–C12, sức chứa 1500. Cùng quy ước mã/tên/block như form "Thêm giàn
// kệ" (POST /api/shelves): mã {mã phòng}-{Hàng}{Số hàng 2 số}C{Số cột 2 số}. Kệ chung (chưa gán NV/mã cây).
// Chạy được nhiều lần: kệ đang hoạt động thì bỏ qua, kệ đã xoá mềm thì hồi sinh.
// Chạy: npx tsx --env-file=.env prisma/add-kim-dong-mother-shelves.ts
const ROOM_CODE = "SX-F-PS";
const CAPACITY = 1500;
const COLS = 12;
const BLOCKS: [string, number][] = [["P", 9], ["Q", 9], ["T", 7], ["J", 7], ["O", 8], ["N", 8], ["R", 8], ["S", 5]];

(async () => {
  const room = await prisma.room.findUniqueOrThrow({ where: { code: ROOM_CODE }, select: { id: true, code: true, warehouseId: true, type: true } });
  if (room.type !== "PHONG_MAU_ME") throw new Error(`${ROOM_CODE} không phải Phòng mẫu mẹ`);

  const grid: { code: string; name: string; block: string; rowNumber: number; colNumber: number }[] = [];
  for (const [row, count] of BLOCKS) {
    for (let r = 1; r <= count; r++) {
      const rr = String(r).padStart(2, "0");
      for (let c = 1; c <= COLS; c++) {
        const cc = String(c).padStart(2, "0");
        grid.push({ code: `${room.code}-${row}${rr}C${cc}`, name: `Kệ ${row}${rr}C${cc}`, block: `${row}${rr}`, rowNumber: r, colNumber: c });
      }
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.shelf.findMany({ where: { code: { in: grid.map((s) => s.code) } }, select: { id: true, code: true, isActive: true } });
    const active = new Set(existing.filter((s) => s.isActive).map((s) => s.code));
    const inactive = new Map(existing.filter((s) => !s.isActive).map((s) => [s.code, s.id]));
    const data = (s: (typeof grid)[number]) => ({
      name: s.name, warehouseId: room.warehouseId, roomId: room.id, rowNumber: s.rowNumber, colNumber: s.colNumber, block: s.block,
      capacity: CAPACITY, assignedStaffId: null, sharedMotherPool: null, plantTypeId: null,
    });
    const toInsert = grid.filter((s) => !active.has(s.code) && !inactive.has(s.code));
    if (toInsert.length > 0) await tx.shelf.createMany({ data: toInsert.map((s) => ({ code: s.code, ...data(s) })) });
    const toReactivate = grid.filter((s) => inactive.has(s.code));
    for (const s of toReactivate) {
      await tx.shelf.update({ where: { id: inactive.get(s.code)! }, data: { ...data(s), isActive: true, groupId: null, rotationGroupId: null, allowedCodes: [] } });
    }
    return { inserted: toInsert.length, reactivated: toReactivate.length, skipped: active.size };
  }, { timeout: 60000 });

  console.log(`Tổng ${grid.length} kệ: tạo mới ${result.inserted}, hồi sinh ${result.reactivated}, đã có bỏ qua ${result.skipped}`);
  const byBlock = await prisma.shelf.groupBy({
    by: ["block"], where: { roomId: room.id, isActive: true, block: { in: [...new Set(grid.map((s) => s.block))] } }, _count: { _all: true }, _min: { capacity: true }, _max: { capacity: true },
  });
  console.log(byBlock.sort((a, b) => (a.block ?? "").localeCompare(b.block ?? "")).map((b) => `${b.block}:${b._count._all}`).join(" "));
  console.log("Tổng kệ Phòng mẫu mẹ SX-F-PS đang hoạt động:", await prisma.shelf.count({ where: { roomId: room.id, isActive: true } }));
  process.exit(0);
})().catch((e) => { console.error("LOI:", e.message); process.exit(1); });
