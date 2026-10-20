// Chạy 1 lần (idempotent): lượt cấy R&D tạo TRƯỚC 20/10/2026 mà CHƯA nhập kết quả (recordedAt null) và chưa có
// chỉ định — tạo 1 chỉ định cấy thật tại Kho sản xuất R&D cho từng lượt (xem src/lib/rnd-instruction-create.ts):
// ngày = ngày cấy của lượt, giao cho người tạo lượt, mẫu mẹ = số MM đưa vào. Lượt đã nhập kết quả giữ nguyên.
//   npx tsx --env-file=.env prisma/backfill-trial-round-instructions.ts          # chỉ in
//   npx tsx --env-file=.env prisma/backfill-trial-round-instructions.ts --apply  # ghi thật
import { prisma } from "../src/lib/prisma";
import { prepareRndInstruction, insertRndInstruction } from "../src/lib/rnd-instruction-create";

async function main() {
  const apply = process.argv.includes("--apply");
  const rounds = await prisma.trialCultivationRound.findMany({
    where: { recordedAt: null, instructionId: null },
    orderBy: { plantedAt: "asc" },
    select: { id: true, plantedAt: true, motherInputQuantity: true, createdById: true, createdBy: { select: { code: true, role: true } }, trialVariety: { select: { code: true, name: true } } },
  });
  const plantTypes = new Map(
    (await prisma.plantType.findMany({ where: { code: { in: rounds.map((r) => r.trialVariety.code) } }, select: { id: true, code: true } })).map((p) => [p.code, p.id])
  );
  for (const r of rounds) {
    console.log(`${r.trialVariety.code} ${r.trialVariety.name} | cấy ${r.plantedAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} | MM ${r.motherInputQuantity} | ${r.createdBy.code} (${r.createdBy.role})${plantTypes.has(r.trialVariety.code) ? "" : " | THIẾU MÃ CÂY — bỏ qua"}`);
  }
  const todo = rounds.filter((r) => plantTypes.has(r.trialVariety.code));
  console.log(`Tổng ${rounds.length} lượt chưa nhập kết quả, sẽ tạo ${todo.length} chỉ định.`);
  if (!apply) { console.log("Dry-run — thêm --apply để ghi."); return; }
  let done = 0;
  for (const r of todo) {
    const prep = await prepareRndInstruction({ plantTypeCode: r.trialVariety.code, assignedToId: r.createdById, at: r.plantedAt });
    await prisma.$transaction(async (tx) => {
      const inst = await insertRndInstruction(tx, prep, {
        plantTypeId: plantTypes.get(r.trialVariety.code)!, mediumTypeId: null, quantity: r.motherInputQuantity,
        createdById: r.createdById, assignedToId: r.createdById, at: r.plantedAt,
      });
      const linked = await tx.trialCultivationRound.updateMany({ where: { id: r.id, instructionId: null }, data: { instructionId: inst.id } });
      if (linked.count === 0) throw new Error(`Lượt ${r.id} vừa được liên kết — bỏ qua`);
      console.log(`  ${r.trialVariety.code} → ${inst.code}`);
    });
    done++;
  }
  console.log(`Đã tạo ${done} chỉ định.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
