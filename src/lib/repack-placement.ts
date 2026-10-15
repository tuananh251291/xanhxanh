import type { Prisma } from "@prisma/client";
import { addWeeks } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import { sumLotQuantity } from "@/types";

export class RepackPlacementError extends Error {}

type RepackInstructionForPlacement = {
  id: string;
  sourceShelfId: string;
  outputStageCode: string;
  confirmedPassedQuantity: number | null;
  confirmedFailedQuantity: number | null;
  plantType: { id: string; code: string; rootingWeeks: number };
};

// Kho mô "Sắp xếp" thành phẩm đã xử lý xong quay lại Phòng ra rễ — mirror đúng kiểu merge-vào-lô-ACTIVE-
// có-sẵn-hoặc-tạo-mới + kiểm tra sức chứa của POST /api/inventory/stock-in (nhánh SHELF), nhưng đích LUÔN
// do caller truyền vào (mặc định = sourceShelf.code, gợi ý "về đúng kệ gốc" — xem [id]/place/route.ts),
// KHÔNG chạy qua thuật toán chọn kệ tự động (planShelfAssignments) vì đích đã biết trước.
//
// totalQuantity xếp lên kệ = confirmedPassedQuantity + confirmedFailedQuantity — hàng "không đạt" (VD cây
// quá nhỏ) vẫn là hàng tồn THẬT, vẫn được xếp kho đầy đủ, chỉ không tính vào creditedQuantity (lương) —
// đúng nguyên tắc TransferItem.unqualifiedQuantity đã dùng ở luồng bàn giao Phòng tối.
export async function placeRepackOutput(
  tx: Prisma.TransactionClient,
  params: { repackInstruction: RepackInstructionForPlacement; shelfCode: string; warehouseId: string; staffCode: string }
) {
  const { repackInstruction, warehouseId, staffCode } = params;
  const shelfCode = params.shelfCode.trim().toUpperCase();
  if (!shelfCode) throw new RepackPlacementError("Cần nhập mã kệ đích");

  const shelf = await tx.shelf.findFirst({
    where: { code: shelfCode, warehouseId, isActive: true, room: { type: "PHONG_RA_RE" } },
    include: {
      lots: { where: { status: "ACTIVE" }, select: { id: true, quantity: true } },
    },
  });
  if (!shelf) {
    throw new RepackPlacementError(`Không tìm thấy kệ ${shelfCode} đang hoạt động trong Phòng ra rễ của kho này`);
  }
  // Chỉ cho chọn kệ ĐÃ CÓ SẴN cây thành phẩm — trừ đúng kệ nguồn (luôn cho phép, kể cả khi vừa lấy hết
  // sạch hàng để xử lý nên tạm thời trống, vì đây là gợi ý mặc định "về đúng kệ gốc" — xem
  // [id]/place/route.ts). Tránh Kho mô gõ nhầm sang 1 kệ trống/kệ khác loại chưa từng chứa thành phẩm.
  if (shelf.id !== repackInstruction.sourceShelfId && shelf.lots.length === 0) {
    throw new RepackPlacementError(
      `Kệ ${shelf.code} đang trống — chỉ được chọn kệ đã có sẵn cây thành phẩm (Phòng ra rễ), hoặc để trống để dùng kệ gốc`
    );
  }

  const passed = repackInstruction.confirmedPassedQuantity ?? 0;
  const failed = repackInstruction.confirmedFailedQuantity ?? 0;
  const totalQuantity = passed + failed;
  if (totalQuantity <= 0) {
    throw new RepackPlacementError("Chưa có số lượng đạt/không đạt đã kiểm tra để sắp xếp");
  }

  const used = sumLotQuantity(shelf.lots);
  const capLeft = shelf.capacity === null ? Infinity : shelf.capacity - used;
  if (totalQuantity > capLeft) {
    throw new RepackPlacementError(
      `Kệ ${shelf.code} không đủ chỗ trống (còn ${capLeft.toLocaleString("vi-VN")}, cần ${totalQuantity.toLocaleString("vi-VN")}) — hãy nhập mã kệ khác`
    );
  }

  const existingLot = await tx.lot.findFirst({
    where: {
      shelfId: shelf.id,
      plantTypeId: repackInstruction.plantType.id,
      stageCode: repackInstruction.outputStageCode,
      status: "ACTIVE",
    },
    orderBy: { enteredAt: "asc" },
  });

  if (existingLot) {
    const lot = await tx.lot.update({
      where: { id: existingLot.id },
      data: { quantity: { increment: totalQuantity } },
    });
    return { shelf, lot, created: false };
  }

  const now = new Date();
  const code = await generateLotCode({
    plantTypeCode: repackInstruction.plantType.code,
    staffCode,
    stageCode: repackInstruction.outputStageCode,
    date: now,
    client: tx,
  });
  const lot = await tx.lot.create({
    data: {
      code,
      plantTypeId: repackInstruction.plantType.id,
      stage: "THANH_PHAM",
      stageCode: repackInstruction.outputStageCode,
      shelfId: shelf.id,
      quantity: totalQuantity,
      initialQuantity: totalQuantity,
      status: "ACTIVE",
      enteredAt: now,
      expectedMoveAt: addWeeks(now, repackInstruction.plantType.rootingWeeks),
    },
  });
  return { shelf, lot, created: true };
}
