import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

// Chạy 1 lần SAU db push thêm cột PlantTypeKpiRate.stageCode: đơn giá cũ chỉ theo mã cây (áp chung mọi
// quy cách) đã được db push gán stageCode = "T01" — nhân bản sang M05/T05 để Bảng lương không đổi cho tới
// khi HCNS đặt đơn giá riêng từng quy cách. An toàn chạy lại (bỏ qua combo đã có).
//   npx tsx prisma/migrate-kpi-rate-stage-codes.ts
const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const t01Rates = await prisma.plantTypeKpiRate.findMany({ where: { stageCode: "T01" } });
  let created = 0;
  for (const r of t01Rates) {
    for (const stageCode of ["M05", "T05"]) {
      const exists = await prisma.plantTypeKpiRate.findUnique({
        where: { plantTypeId_stageCode: { plantTypeId: r.plantTypeId, stageCode } },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.plantTypeKpiRate.create({ data: { plantTypeId: r.plantTypeId, stageCode, vndPerUnit: r.vndPerUnit } });
      created += 1;
    }
  }
  console.log(`T01: ${t01Rates.length} mã cây — đã tạo thêm ${created} đơn giá M05/T05`);
}

main().finally(() => prisma.$disconnect());
