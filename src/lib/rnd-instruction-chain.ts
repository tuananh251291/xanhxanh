import { prisma } from "@/lib/prisma";
import { generateLotCode, generateInstructionCode } from "@/lib/codes";
import { getOrCreateRndWarehouse, getOrCreateRndInputShelf } from "@/lib/rnd-instruction-warehouse";
import { createAlert } from "@/lib/inventory";

type PrevInstructionForChain = {
  id: string;
  plantTypeId: string;
  assignedToId: string | null;
  createdById: string;
  items: { motherMediumTypeId: string | null }[];
};

// Được gọi ngay khi 1 chỉ định R&D (Admin kỹ thuật tự tạo, xem POST /api/rnd-production/instructions)
// chuyển ENDED do MOTHER_USED_UP — xem hook trong POST /api/daily-records. Đầu vào kì tiếp theo CHỈ lấy
// từ mẫu mẹ (M05) trả ra của kì trước (đã chốt với Admin — thành phẩm T05/T01 không tự chuyển kì mới, chờ
// bàn giao sang kho khác, xem src/lib/rnd-warehouse-handover.ts). Tạo sẵn kì mới ở DRAFT (chưa ACTIVE) —
// Admin kỹ thuật chỉ cần vào xác nhận ngày bắt đầu (PATCH /api/rnd-production/instructions/[id]/confirm-start).
export async function createNextRndRound(prevInstruction: PrevInstructionForChain): Promise<void> {
  const producedM05 = await prisma.dailyRecordItem.findMany({
    where: { dailyRecord: { instructionId: prevInstruction.id }, stage: "MAU_ME" },
    select: { quantityCreated: true },
  });
  const totalM05 = producedM05.reduce((sum, i) => sum + i.quantityCreated, 0);
  if (totalM05 <= 0) return; // Không còn mẫu mẹ để nhân tiếp — dừng chuỗi tại đây.

  const actorId = prevInstruction.assignedToId ?? prevInstruction.createdById;
  const [plantType, staff, rndWarehouse] = await Promise.all([
    prisma.plantType.findUniqueOrThrow({ where: { id: prevInstruction.plantTypeId }, select: { code: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { code: true } }),
    getOrCreateRndWarehouse(),
  ]);
  const bucketShelf = await getOrCreateRndInputShelf(rndWarehouse.id);

  const lotCode = await generateLotCode({ plantTypeCode: plantType.code, staffCode: staff.code, stageCode: "M05" });
  const newLot = await prisma.lot.create({
    data: {
      code: lotCode,
      plantTypeId: prevInstruction.plantTypeId,
      stage: "MAU_ME",
      stageCode: "M05",
      shelfId: bucketShelf.id,
      quantity: totalM05,
      initialQuantity: totalM05,
      status: "PLANTED",
    },
  });

  const instructionCode = await generateInstructionCode({ warehouseCode: rndWarehouse.code, shelfCode: bucketShelf.code });
  const nextInstruction = await prisma.plantingInstruction.create({
    data: {
      code: instructionCode,
      plantTypeId: prevInstruction.plantTypeId,
      createdById: prevInstruction.createdById,
      assignedToId: actorId,
      inputMotherQuantity: totalM05,
      status: "DRAFT",
      previousInstructionId: prevInstruction.id,
      items: {
        create: {
          shelfId: bucketShelf.id,
          lotId: newLot.id,
          stageCode: "M05",
          quantity: totalM05,
          motherMediumTypeId: prevInstruction.items[0]?.motherMediumTypeId ?? null,
        },
      },
    },
  });

  await createAlert({
    type: "RND_NEXT_ROUND_READY",
    title: "Kì cấy R&D tiếp theo đã sẵn sàng",
    message: `Kì cấy tiếp theo (${instructionCode}) đã tự tạo với ${totalM05.toLocaleString("vi-VN")} mẫu mẹ chuyển tiếp — vào xác nhận ngày bắt đầu.`,
    userId: actorId,
    relatedId: nextInstruction.id,
    relatedType: "PlantingInstruction",
  });
}
