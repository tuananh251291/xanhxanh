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

// Người được giao 1 chỉ định cấy R&D (Cấy sản xuất R&D + lượt cấy giống thử nghiệm): chính Admin kỹ thuật
// đang tạo, hoặc BẤT KỲ NV cấy mô đang hoạt động (ở khu sản xuất nào cũng được — NV nhập dữ liệu cấy ở trang
// Nhập dữ liệu cấy như mọi chỉ định khác, lô ra vào Phòng tối cá nhân của NV tại Kho sản xuất R&D). Trả về
// thông báo lỗi, null = hợp lệ.
export async function validateRndAssignee(assignedToId: string, selfId: string): Promise<string | null> {
  if (assignedToId === selfId) return null;
  const staff = await prisma.user.findUnique({ where: { id: assignedToId }, select: { role: true, isActive: true } });
  if (!staff || !staff.isActive || staff.role !== "CAY_MO") return "NV được giao không hợp lệ — cần là NV cấy mô đang làm việc";
  return null;
}

// NV cấy mô đang hoạt động để chọn ở ô "Giao cho" — NV đang làm việc tại Kho sản xuất R&D xếp trước.
export async function listRndAssignableStaff() {
  const staff = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true },
    select: { id: true, code: true, name: true, workplaceWarehouse: { select: { name: true, isRnd: true } } },
    orderBy: { name: "asc" },
  });
  return staff
    .map((s) => ({ id: s.id, code: s.code, name: s.name, warehouseName: s.workplaceWarehouse?.name ?? null, isRnd: !!s.workplaceWarehouse?.isRnd }))
    .sort((a, b) => Number(b.isRnd) - Number(a.isRnd));
}

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
