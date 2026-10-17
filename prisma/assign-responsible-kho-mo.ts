// Gán NV Kho mô phụ trách (User.responsibleKhoMoId) cho NV cấy mô theo danh sách vận hành 10/2026:
// - Bát Tràng (SX-TA): mọi NV cấy mô → Hồ Xuân Thủy (NVK01)
// - Kim Động (SX-F): các mã trong KIM_DONG_DUC → Vũ Hồng Đức (NVCM159), còn lại → Nguyễn Thị Như Quỳnh (NVK03)
// Gồm cả NV đã nghỉ (để nếu khôi phục vẫn đúng người phụ trách).
//   npx tsx --env-file=.env prisma/assign-responsible-kho-mo.ts          → chạy thử, chỉ in kết quả
//   npx tsx --env-file=.env prisma/assign-responsible-kho-mo.ts --apply  → ghi vào DB
import { prisma } from "../src/lib/prisma";

const KIM_DONG_DUC = [
  204, 203, 205, 207, 248, 211, 217, 216, 220, 222, 223, 265, 215, 235, 230, 238, 251, 244, 255, 266, 268, 270, 276, 264, 277,
].map((n) => `NVCM${n}`);

const RULES: { warehouseCode: string; khoMoCode: string; only?: string[]; except?: string[] }[] = [
  { warehouseCode: "SX-TA", khoMoCode: "NVK01" },
  { warehouseCode: "SX-F", khoMoCode: "NVCM159", only: KIM_DONG_DUC },
  { warehouseCode: "SX-F", khoMoCode: "NVK03", except: KIM_DONG_DUC },
];

(async () => {
  const apply = process.argv.includes("--apply");
  for (const rule of RULES) {
    const khoMo = await prisma.user.findUnique({
      where: { code: rule.khoMoCode },
      select: { id: true, name: true, role: true, workplaceWarehouse: { select: { code: true } } },
    });
    if (!khoMo || khoMo.role !== "KHO_MO" || khoMo.workplaceWarehouse?.code !== rule.warehouseCode) {
      throw new Error(`${rule.khoMoCode} không phải NV Kho mô của ${rule.warehouseCode}`);
    }
    const staff = await prisma.user.findMany({
      where: {
        role: "CAY_MO",
        workplaceWarehouse: { code: rule.warehouseCode },
        ...(rule.only ? { code: { in: rule.only } } : {}),
        ...(rule.except ? { code: { notIn: rule.except } } : {}),
      },
      select: { id: true, code: true, responsibleKhoMoId: true },
      orderBy: { code: "asc" },
    });
    if (rule.only) {
      const missing = rule.only.filter((c) => !staff.some((s) => s.code === c));
      if (missing.length) console.log(`  ⚠ Không tìm thấy NV cấy mô ở ${rule.warehouseCode}: ${missing.join(", ")}`);
    }
    const changed = staff.filter((s) => s.responsibleKhoMoId !== khoMo.id);
    console.log(`${rule.warehouseCode} → ${khoMo.name} (${rule.khoMoCode}): ${staff.length} NV, đổi ${changed.length}: ${staff.map((s) => s.code).join(", ")}`);
    if (apply && changed.length) {
      await prisma.user.updateMany({ where: { id: { in: changed.map((s) => s.id) } }, data: { responsibleKhoMoId: khoMo.id } });
    }
  }
  console.log(apply ? "Đã ghi vào DB." : "Chạy thử — thêm --apply để ghi.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
