// Chạy 1 lần sau khi deploy luồng "Kiểm tra kho cây tuần gửi Quản lý kho TP" (idempotent — chạy lại không sao):
//   npx tsx --env-file=.env prisma/migrate-ktp-legacy-destroy-proposals.ts          # chỉ in, không ghi
//   npx tsx --env-file=.env prisma/migrate-ktp-legacy-destroy-proposals.ts --apply  # ghi thật
// NV Kho thành phẩm gửi phiếu kiểm tra tuần TRƯỚC lúc deploy thì đi theo luồng cũ: Đề xuất hủy
// (ContaminationProposal type=HUY, PENDING, gửi Admin) — tồn đã trừ khỏi phòng kiểm tra lúc gửi. Quản lý kho
// TP không thấy các dòng này trong nhiệm vụ tuần (QLK_DE_XUAT_TUAN chỉ gộp FinishedGoodsCheckLine), nên
// chuyển chúng thành FinishedGoodsCheckLine (destroyQuantity = quantity, KHÔNG trừ tồn lại), xoá đề xuất cũ
// và đánh dấu nhiệm vụ DE_XUAT_TRONG_HUY tương ứng là hoàn thành (như POST /api/finished-goods-checks).
// Đề xuất TRONG của luồng cũ chỉ in ra để xử lý tay.
import { prisma } from "../src/lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const proposals = await prisma.contaminationProposal.findMany({
    where: {
      status: "PENDING",
      roomId: { not: null },
      dailyTask: { type: "DE_XUAT_TRONG_HUY" },
      warehouse: { type: "THANH_PHAM" },
      requestedBy: { role: { in: ["KHO_THANH_PHAM", "QUAN_LY_KHO_THANH_PHAM"] } },
    },
    select: {
      id: true, code: true, type: true, warehouseId: true, roomId: true, plantTypeId: true, stageCode: true,
      quantity: true, requestedById: true, dailyTaskId: true, createdAt: true,
      plantType: { select: { code: true } }, dailyTask: { select: { code: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const destroy = proposals.filter((p) => p.type === "HUY");
  for (const p of proposals.filter((p) => p.type !== "HUY")) {
    console.log(`BỎ QUA (${p.type}, xử lý tay): ${p.code} ${p.plantType.code} ${p.stageCode} x${p.quantity} — ${p.dailyTask?.code}`);
  }
  for (const p of destroy) console.log(`${p.code} ${p.plantType.code} ${p.stageCode} x${p.quantity} — ${p.dailyTask?.code}`);
  console.log(`Tổng ${destroy.length} đề xuất hủy cần chuyển.`);
  if (!apply || destroy.length === 0) {
    if (!apply) console.log("Dry-run — thêm --apply để ghi.");
    return;
  }

  const lastByTask = new Map<string, Date>();
  for (const p of destroy) lastByTask.set(p.dailyTaskId!, p.createdAt);

  await prisma.$transaction(async (tx) => {
    for (const p of destroy) {
      await tx.finishedGoodsCheckLine.create({
        data: {
          dailyTaskId: p.dailyTaskId!,
          warehouseId: p.warehouseId,
          sourceRoomId: p.roomId!,
          plantTypeId: p.plantTypeId,
          stageCode: p.stageCode,
          destroyQuantity: p.quantity,
          toProcessingQuantity: 0,
          createdById: p.requestedById,
          createdAt: p.createdAt,
        },
      });
      await tx.contaminationProposal.delete({ where: { id: p.id } });
    }
    for (const [taskId, completedAt] of lastByTask) {
      await tx.dailyTask.updateMany({ where: { id: taskId, status: "PENDING" }, data: { status: "COMPLETED", completedAt } });
    }
  }, { timeout: 60000 });
  console.log(`Đã chuyển ${destroy.length} dòng, hoàn thành ${lastByTask.size} nhiệm vụ.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
