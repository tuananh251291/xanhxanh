// Chạy 1 lần khi deploy Nghiệp vụ 5 (Vườn SX): npx tsx --env-file=.env prisma/migrate-garden-stock-lines.ts
import { prisma } from "../src/lib/prisma";

// Chuyển dữ liệu NV4 cũ sang dòng tồn NV5 (GardenStockLine) — chạy được nhiều lần (lô đã có dòng tồn thì bỏ qua).
// Mỗi lô: placement → dòng tồn theo dãy (kho = lot.pool, size = lot.stageCode, NV = lot.staffId), phần chưa xếp →
// dòng tồn rowId null; trừ đúng lot.quantity khỏi GardenStock (pool) để không đếm 2 lần. GardenFinishedStock → dòng
// tồn Kho thành phẩm (không lô). Tất cả trong 1 transaction.
(async () => {
  const adminId = (await prisma.user.findFirstOrThrow({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } })).id;
  await prisma.$transaction(async (tx) => {
    const lots = await tx.gardenCareLot.findMany({
      where: { stockLines: { none: {} } },
      select: {
        id: true, code: true, gardenId: true, pool: true, plantTypeId: true, stageCode: true, quantity: true, staffId: true,
        placements: { where: { quantity: { gt: 0 } }, select: { rowId: true, quantity: true } },
      },
    });
    for (const l of lots) {
      const placed = l.placements.reduce((s, p) => s + p.quantity, 0);
      const unplaced = l.quantity - placed;
      if (unplaced < 0) throw new Error(`${l.code}: tổng đã xếp ${placed} > số lô ${l.quantity}`);
      for (const p of l.placements) {
        await tx.gardenStockLine.create({ data: { gardenId: l.gardenId, pool: l.pool, lotId: l.id, plantTypeId: l.plantTypeId, stageCode: l.stageCode, rowId: p.rowId, staffId: l.staffId, quantity: p.quantity } });
      }
      if (unplaced > 0) {
        await tx.gardenStockLine.create({ data: { gardenId: l.gardenId, pool: l.pool, lotId: l.id, plantTypeId: l.plantTypeId, stageCode: l.stageCode, rowId: null, staffId: l.staffId, quantity: unplaced } });
      }
      if (l.quantity > 0) {
        const dec = await tx.gardenStock.updateMany({
          where: { gardenId: l.gardenId, pool: l.pool, plantTypeId: l.plantTypeId, stageCode: l.stageCode, quantity: { gte: l.quantity } },
          data: { quantity: { decrement: l.quantity } },
        });
        if (dec.count !== 1) throw new Error(`${l.code}: GardenStock không đủ ${l.quantity} để chuyển`);
        await tx.gardenMovementLog.create({
          data: { gardenId: l.gardenId, type: "RECEIVE", lotCode: l.code, plantTypeId: l.plantTypeId, quantity: l.quantity, toPool: l.pool, toStage: l.stageCode, note: "Chuyển dữ liệu sang tồn chi tiết (Nghiệp vụ 5)", byId: adminId },
        });
      }
      console.log(`${l.code}: ${l.placements.length} dòng theo dãy + chưa xếp ${unplaced} (tổng ${l.quantity})`);
    }
    const finished = await tx.gardenFinishedStock.findMany({ where: { quantity: { gt: 0 } } });
    for (const fs of finished) {
      await tx.gardenStockLine.create({ data: { gardenId: fs.gardenId, pool: "FINISHED", plantTypeId: fs.plantTypeId, stageCode: fs.stageCode, quantity: fs.quantity } });
      await tx.gardenFinishedStock.update({ where: { id: fs.id }, data: { quantity: 0 } });
    }
    console.log(`Kho thành phẩm cũ chuyển: ${finished.length} dòng`);
  });
  const lines = await prisma.gardenStockLine.findMany({ select: { pool: true, stageCode: true, quantity: true, lot: { select: { code: true } }, plantType: { select: { code: true } }, row: { select: { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } } } });
  for (const x of lines) console.log("  dong ton", x.lot?.code, x.plantType.code, x.stageCode, x.pool, x.row ? `${x.row.rack.house.number}${x.row.rack.letter}${x.row.number}` : "chua xep", x.quantity);
  console.log("GardenStock con lai:", JSON.stringify(await prisma.gardenStock.findMany({ where: { quantity: { gt: 0 } }, select: { pool: true, stageCode: true, quantity: true, plantType: { select: { code: true } } } })));
  process.exit(0);
})().catch((e) => { console.error("LOI:", e.message); process.exit(1); });
