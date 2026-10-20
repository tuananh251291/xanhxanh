import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateLotCode, generateInstructionCode } from "@/lib/codes";
import { getOrCreateRndWarehouse, getOrCreateRndInputShelf } from "@/lib/rnd-instruction-warehouse";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek } from "date-fns";

// Tạo 1 chỉ định cấy THẬT tại "Kho sản xuất R&D" — gộp "tạo → bàn giao → nhận mẫu mẹ" (mẫu mẹ M05 tự khai,
// lô PLANTED trong kệ ẩn Phòng tối của người được giao). Dùng chung cho "Cấy sản xuất R&D" (POST
// /api/rnd-production/instructions) và mỗi lượt cấy của giống thử nghiệm R&D (TrialCultivationRound — mỗi lượt
// cấy = 1 chỉ định cấy, kết quả nhập theo chỉ định, xem POST /api/trial-varieties + .../[id]/rounds).
// 2 bước: prepare (ngoài transaction — tạo kho/kệ ẩn nếu chưa có, sinh mã) rồi insert (trong transaction).

export type RndInstructionPrep = {
  shelfId: string;
  lotCode: string;
  instructionCode: string;
};

export async function prepareRndInstruction(params: { plantTypeCode: string; assignedToId: string; at?: Date }): Promise<RndInstructionPrep> {
  const rndWarehouse = await getOrCreateRndWarehouse();
  const staff = await prisma.user.findUnique({ where: { id: params.assignedToId }, select: { code: true } });
  const shelf = await getOrCreateRndInputShelf(rndWarehouse.id, params.assignedToId);
  const lotCode = await generateLotCode({ plantTypeCode: params.plantTypeCode, staffCode: staff?.code ?? "000", stageCode: "M05" });
  const instructionCode = await generateInstructionCode({ warehouseCode: rndWarehouse.code, shelfCode: shelf.code, date: params.at });
  return { shelfId: shelf.id, lotCode, instructionCode };
}

export async function insertRndInstruction(
  tx: Prisma.TransactionClient,
  prep: RndInstructionPrep,
  params: { plantTypeId: string; mediumTypeId: string | null; quantity: number; createdById: string; assignedToId: string; at?: Date }
) {
  const at = params.at ?? new Date();
  const lot = await tx.lot.create({
    data: {
      code: prep.lotCode,
      plantTypeId: params.plantTypeId,
      stage: "MAU_ME",
      stageCode: "M05",
      shelfId: prep.shelfId,
      quantity: params.quantity,
      initialQuantity: params.quantity,
      status: "PLANTED",
    },
  });
  return tx.plantingInstruction.create({
    data: {
      code: prep.instructionCode,
      plantTypeId: params.plantTypeId,
      createdById: params.createdById,
      assignedToId: params.assignedToId,
      inputMotherQuantity: params.quantity,
      status: "ACTIVE",
      weekStart: toStoredWeekStart(startOfWeek(at, { weekStartsOn: 1 })),
      handedOverAt: at,
      handedOverById: params.createdById,
      motherReceivedAt: at,
      items: {
        create: {
          shelfId: prep.shelfId,
          lotId: lot.id,
          stageCode: "M05",
          quantity: params.quantity,
          motherMediumTypeId: params.mediumTypeId,
        },
      },
    },
  });
}
