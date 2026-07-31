import { prisma } from "@/lib/prisma";
import { generateLotCode } from "@/lib/codes";
import { sumLotQuantity } from "@/types";
import { ShelfAssignError, matchesAllowedCodes } from "@/lib/shelf-assignment";

export type MovedLotInfo = { lotCode: string; quantity: number };

// Nhân viên Kho mô chuyển mẫu mẹ từ GIÀN NGUỒN sang GIÀN ĐÍCH trong CÙNG Phòng mẫu mẹ của kho mình phụ
// trách — dùng để dồn/xếp lại kho cho gọn, KHÔNG liên quan tới bàn giao từ Phòng tối (đó là
// receive-phong-toi.ts). NV chọn giàn (không chọn lô cụ thể) — 1 giàn có thể đang chứa NHIỀU lô cùng
// lúc (khác NV/khác ngày cấy), nên rút theo FIFO (lô vào trước rút trước, giống quy ước trừ tồn nhiều
// lô đang dùng ở nơi khác — xem api/goods-receipt-items/[id]/return/route.ts), tự tách lô nếu 1 lô
// không đủ hết phần cần rút hoặc rút tràn sang nhiều lô.
//
// KHÔNG còn khái niệm "hạn cấy chuyển" gắn theo từng lô ở đây — "đạt hạn" của mẫu mẹ giờ tính THUẦN theo
// lịch xoay vòng của Nhóm tuần mẫu mẹ mà GIÀN ĐÍCH thuộc về (xem summarizeMotherWeekGroups ở
// src/lib/mother-week-group.ts), không phụ thuộc ngày lô cụ thể vào giàn. Chuyển vào giàn đã gán Nhóm
// tuần nào thì tự động theo lịch của Nhóm đó; chuyển về giàn chưa gán Nhóm (Kho mẫu mẹ chung hoặc giàn
// "đã chia" nhưng chưa gán Nhóm) thì không có/không cần thông tin hạn. Vì vậy hàm này chỉ đổi shelfId,
// giữ nguyên enteredAt/expectedMoveAt gốc của từng lô (2 field này không còn được dùng để tính hạn của
// mẫu mẹ nữa, chỉ còn mang tính lịch sử).
export async function moveMotherStock(params: {
  fromShelfCode: string;
  quantity: number;
  toShelfCode: string;
  workplaceWarehouseId: string;
}): Promise<{ movedLots: MovedLotInfo[]; fromShelfCode: string; toShelfCode: string; totalQuantity: number }> {
  const { fromShelfCode, quantity, toShelfCode, workplaceWarehouseId } = params;

  if (quantity <= 0) throw new ShelfAssignError("Số cụm chuyển phải lớn hơn 0");
  if (fromShelfCode.trim().toUpperCase() === toShelfCode.trim().toUpperCase()) {
    throw new ShelfAssignError("Giàn đích trùng với giàn nguồn");
  }

  const fromShelf = await prisma.shelf.findFirst({
    where: { code: fromShelfCode.trim().toUpperCase(), warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    select: { id: true, code: true },
  });
  if (!fromShelf) {
    throw new ShelfAssignError(`Không tìm thấy giàn Phòng mẫu mẹ đang hoạt động thuộc kho này với mã: ${fromShelfCode}`);
  }

  const toShelf = await prisma.shelf.findFirst({
    where: { code: toShelfCode.trim().toUpperCase(), warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    include: { lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } } },
  });
  if (!toShelf) {
    throw new ShelfAssignError(`Không tìm thấy giàn Phòng mẫu mẹ đang hoạt động thuộc kho này với mã: ${toShelfCode}`);
  }

  const sourceLots = await prisma.lot.findMany({
    where: { shelfId: fromShelf.id, status: "ACTIVE", stage: "MAU_ME" },
    include: {
      plantType: { select: { code: true } },
      instruction: { select: { assignedToId: true } },
      // Lô đã được chọn làm nguồn cho 1 chỉ định cấy CÒN HIỆU LỰC (ACTIVE/DRAFT) nhưng Kho mô CHƯA bàn
      // giao (handedOverAt null) — mẫu mẹ tuy vẫn nằm ACTIVE trên kệ (xem POST /api/instructions, không
      // còn trừ tồn ngay lúc tạo chỉ định nữa) nhưng đã "có chủ", không được tự ý dồn/chuyển giàn nữa vì
      // sẽ làm lệch giàn kệ KY_THUAT đã chọn lúc ra chỉ định. Chỉ định đã hủy (CANCELLED) hoặc đã bàn
      // giao thì không còn giữ chỗ nữa — không lọc ở đây.
      instructionItems: {
        where: { instruction: { status: { in: ["ACTIVE", "DRAFT"] }, handedOverAt: null } },
        select: { instruction: { select: { code: true } } },
      },
    },
    orderBy: { enteredAt: "asc" },
  });
  const totalAvailable = sourceLots.reduce((s, l) => s + l.quantity, 0);
  if (sourceLots.length === 0 || totalAvailable === 0) {
    throw new ShelfAssignError(`Giàn ${fromShelf.code} hiện không có mẫu mẹ nào`);
  }
  if (quantity > totalAvailable) {
    throw new ShelfAssignError(
      `Số cụm chuyển (${quantity.toLocaleString("vi-VN")}) vượt quá tổng tồn hiện có của giàn ${fromShelf.code} (${totalAvailable.toLocaleString("vi-VN")})`
    );
  }

  // Xác định trước sẽ rút bao nhiêu từ lô nào (FIFO) để kiểm tra đủ mọi điều kiện trước khi ghi bất cứ gì.
  const draws: { lot: (typeof sourceLots)[number]; take: number }[] = [];
  let remaining = quantity;
  for (const lot of sourceLots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, lot.quantity);
    draws.push({ lot, take });
    remaining -= take;
  }

  // Không cho sắp xếp lô đã "có chủ" (đang là nguồn của 1 chỉ định cấy chưa bàn giao) — Kho mô cần liên
  // hệ Kỹ thuật hủy chỉ định đó trước, hoặc đợi chỉ định được bàn giao xong rồi sắp xếp phần dư còn lại.
  const lockedDraw = draws.find((d) => d.lot.instructionItems.length > 0);
  if (lockedDraw) {
    const instructionCodes = Array.from(new Set(lockedDraw.lot.instructionItems.map((i) => i.instruction.code)));
    throw new ShelfAssignError(
      `Lô ${lockedDraw.lot.code} trên giàn ${fromShelf.code} đang là nguồn của chỉ định cấy ${instructionCodes.join(", ")} — chỉ định này chưa được Kho mô bàn giao nên chưa thể sắp xếp lại. Cần liên hệ Kỹ thuật hủy chỉ định đó trước khi sắp xếp.`
    );
  }

  // Đúng cây được gắn với giàn kệ đích — kiểm tra cho TỪNG lô nguồn sẽ rút, vì 1 giàn chung có thể đang
  // chứa nhiều mã cây khác nhau cùng lúc.
  for (const { lot } of draws) {
    if (toShelf.assignedStaffId) {
      if (toShelf.plantTypeId !== lot.plantTypeId) {
        throw new ShelfAssignError(
          `Giàn ${toShelf.code} đã gán riêng cho 1 NV và chỉ nhận đúng 1 mã cây — không khớp mã cây ${lot.plantType.code} của lô ${lot.code}`
        );
      }
    } else if (toShelf.allowedCodes.length > 0 && !matchesAllowedCodes(toShelf.allowedCodes, lot.plantType.code)) {
      throw new ShelfAssignError(
        `Giàn ${toShelf.code} không cho phép xếp mã cây ${lot.plantType.code} (lô ${lot.code}) — Cho phép xếp: ${toShelf.allowedCodes.join(", ")}`
      );
    }
  }

  if (toShelf.capacity !== null) {
    const capLeft = toShelf.capacity - sumLotQuantity(toShelf.lots);
    if (quantity > capLeft) {
      throw new ShelfAssignError(
        `Giàn ${toShelf.code} không đủ chỗ — còn trống ${Math.max(0, capLeft).toLocaleString("vi-VN")} cụm, cần chuyển ${quantity.toLocaleString("vi-VN")} cụm`
      );
    }
  }

  const movedLots: MovedLotInfo[] = [];

  await prisma.$transaction(async (tx) => {
    for (const { lot, take } of draws) {
      const isFullMove = take === lot.quantity;

      if (isFullMove) {
        await tx.lot.update({ where: { id: lot.id }, data: { shelfId: toShelf.id } });
        movedLots.push({ lotCode: lot.code, quantity: take });
        continue;
      }

      const staffCode = lot.instruction?.assignedToId
        ? (await tx.user.findUnique({ where: { id: lot.instruction.assignedToId }, select: { code: true } }))?.code
        : null;
      const code = await generateLotCode({ plantTypeCode: lot.plantType.code, staffCode: staffCode ?? "000", stageCode: lot.stageCode, client: tx });

      await tx.lot.update({
        where: { id: lot.id },
        data: { quantity: { decrement: take }, initialQuantity: { decrement: take } },
      });
      await tx.lot.create({
        data: {
          code,
          plantTypeId: lot.plantTypeId,
          stage: lot.stage,
          stageCode: lot.stageCode,
          shelfId: toShelf.id,
          quantity: take,
          initialQuantity: take,
          status: "ACTIVE",
          enteredAt: lot.enteredAt,
          expectedMoveAt: lot.expectedMoveAt,
          instructionId: lot.instructionId,
          parentLotId: lot.id,
        },
      });
      movedLots.push({ lotCode: code, quantity: take });
    }
  });

  return {
    movedLots,
    fromShelfCode: fromShelf.code,
    toShelfCode: toShelf.code,
    totalQuantity: quantity,
  };
}
