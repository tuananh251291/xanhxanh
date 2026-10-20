// Chạy 1 lần (idempotent): giống thử nghiệm R&D tạo TRƯỚC khi "mặc định đưa vào sản xuất" (20/10/2026) — tạo
// mã cây sản xuất cùng mã cho từng giống chưa có (xem ensurePlantTypeForTrialVariety). Thời gian cấy chuyển
// lấy theo số tuần chờ của lượt cấy đầu tiên.
//   npx tsx --env-file=.env prisma/backfill-trial-variety-plant-types.ts          # chỉ in
//   npx tsx --env-file=.env prisma/backfill-trial-variety-plant-types.ts --apply  # ghi thật
import { prisma } from "../src/lib/prisma";
import { ensurePlantTypeForTrialVariety } from "../src/lib/trial-variety-plant-type";

async function main() {
  const apply = process.argv.includes("--apply");
  const varieties = await prisma.trialVariety.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true, plantCategoryId: true, description: true, rounds: { orderBy: { plantedAt: "asc" }, take: 1, select: { waitWeeks: true } } },
  });
  const existing = new Set((await prisma.plantType.findMany({ where: { code: { in: varieties.map((v) => v.code) } }, select: { code: true } })).map((p) => p.code));
  const todo = varieties.filter((v) => !existing.has(v.code));
  for (const v of varieties) console.log(`${v.code} | ${v.name} | ${existing.has(v.code) ? "ĐÃ CÓ mã cây — bỏ qua" : `sẽ tạo (cấy chuyển ${v.rounds[0]?.waitWeeks ?? 4} tuần)`}`);
  console.log(`Tổng ${varieties.length} giống, cần tạo ${todo.length} mã cây.`);
  if (!apply) { console.log("Dry-run — thêm --apply để ghi."); return; }
  await prisma.$transaction(async (tx) => {
    for (const v of todo) {
      await ensurePlantTypeForTrialVariety(tx, {
        code: v.code, name: v.name, plantCategoryId: v.plantCategoryId, description: v.description, transferWaitWeeks: v.rounds[0]?.waitWeeks ?? 4,
      });
    }
  }, { timeout: 60000 });
  console.log(`Đã tạo ${todo.length} mã cây.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
