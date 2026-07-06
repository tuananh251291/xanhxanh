import { prisma } from "@/lib/prisma";
import { motherClusterUnits, MOTHER_SPEC_BAG_SIZE } from "@/types";

export class ShelfAssignError extends Error {}

type LotForAssign = {
  id: string;
  code: string;
  stage: "MAU_ME" | "THANH_PHAM";
  stageCode: string;
  quantity: number;
  plantTypeId: string;
  plantType: { code: string };
  instructionId: string | null;
  instruction: { assignedToId: string | null } | null;
};

type ShelfCandidate = {
  id: string;
  code: string;
  capacity: number | null;
  plantTypeId: string | null;
  assignedStaffId: string | null;
  sharedMotherPool: "QUA_HAN" | "DUNG_HAN" | null;
  roomType: "PHONG_MAU_ME" | "PHONG_RA_RE";
  used: number; // cụm hiện có (chỉ có ý nghĩa với PHONG_MAU_ME)
  hasActiveLot: boolean; // kệ Kho mẫu mẹ đã chia đang có sẵn 1 lô ACTIVE hay không
};

export type ShelfPlacement = {
  lotId: string;
  lot: LotForAssign;
  shelfId: string;
  shelfCode: string;
  quantity: number; // số túi đặt vào kệ này (có thể nhỏ hơn lot.quantity nếu bị chia do tràn 1800 cụm)
  pool: "OWNED" | "SHARED" | "RA_RE";
};

/**
 * Nguyên tắc bàn giao Phòng tối → Kho sáng (KHO_MO xác nhận nhận):
 * - Cây ra rễ (THANH_PHAM) → xếp vào kệ Phòng ra rễ (không ràng buộc, chọn kệ đang dùng ít nhất).
 * - Mẫu mẹ (MAU_ME, M03/M05) → xếp vào đúng kệ của nhân viên phụ trách (Kho mẫu mẹ đã chia — kệ có
 *   assignedStaffId = NV được giao chỉ định cấy đã tạo ra lô này, và đúng mã cây). Mỗi kệ Kho mẫu mẹ
 *   đã chia chỉ chứa đúng 1 lô ACTIVE tại 1 thời điểm — nếu kệ của NV đó đã có lô, toàn bộ lô mới
 *   (không chỉ phần dư) dồn thẳng sang 1 kệ Phòng mẫu mẹ chưa gán nhân viên (Kho mẫu mẹ chung) cùng
 *   mã cây. Nếu kệ đang trống nhưng bản thân lô mới lớn hơn 1800 cụm, phần vượt vẫn được tách thành
 *   lô con và đưa sang Kho mẫu mẹ chung — kệ gốc vẫn chỉ giữ đúng 1 lô (đã giảm số lượng). Hệ thống
 *   tự chọn kệ, không cần KHO_MO chọn tay.
 */
export async function planShelfAssignments(
  transferItems: { lotId: string; lot: LotForAssign }[],
  warehouseId: string
): Promise<ShelfPlacement[]> {
  const shelves = await prisma.shelf.findMany({
    where: { warehouseId, isActive: true, room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } } },
    include: {
      room: { select: { type: true } },
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
    },
  });

  const candidates: ShelfCandidate[] = shelves.map((s) => ({
    id: s.id,
    code: s.code,
    capacity: s.capacity,
    plantTypeId: s.plantTypeId,
    assignedStaffId: s.assignedStaffId,
    sharedMotherPool: s.sharedMotherPool,
    roomType: s.room!.type as "PHONG_MAU_ME" | "PHONG_RA_RE",
    used: s.lots.reduce((sum, l) => sum + motherClusterUnits(l.stageCode, l.quantity), 0),
    hasActiveLot: s.lots.length > 0,
  }));
  const usedById = new Map(candidates.map((c) => [c.id, c.used]));
  const hasActiveLotById = new Map(candidates.map((c) => [c.id, c.hasActiveLot]));

  const placements: ShelfPlacement[] = [];

  for (const { lotId, lot } of transferItems) {
    if (lot.stage === "THANH_PHAM") {
      const pool = candidates.filter((c) => c.roomType === "PHONG_RA_RE");
      if (pool.length === 0) throw new ShelfAssignError("Không có kệ Phòng ra rễ nào trong kho này");
      pool.sort((a, b) => (usedById.get(a.id) ?? 0) - (usedById.get(b.id) ?? 0));
      const target = pool[0];
      placements.push({ lotId, lot, shelfId: target.id, shelfCode: target.code, quantity: lot.quantity, pool: "RA_RE" });
      usedById.set(target.id, (usedById.get(target.id) ?? 0) + lot.quantity);
      continue;
    }

    const bagSize = MOTHER_SPEC_BAG_SIZE[lot.stageCode as keyof typeof MOTHER_SPEC_BAG_SIZE] ?? 1;
    const ownerStaffId = lot.instruction?.assignedToId ?? null;
    let remainingBags = lot.quantity;

    if (ownerStaffId) {
      const owned = candidates.find(
        (c) => c.roomType === "PHONG_MAU_ME" && c.assignedStaffId === ownerStaffId && c.plantTypeId === lot.plantTypeId
      );
      // Kệ đã chia chỉ nhận lô mới khi đang trống — mỗi kệ tối đa 1 lô ACTIVE.
      if (owned && !hasActiveLotById.get(owned.id)) {
        const capLeft = (owned.capacity ?? Infinity) - (usedById.get(owned.id) ?? 0);
        const bagsFit = Math.max(0, Math.floor(capLeft / bagSize));
        const placeBags = Math.min(bagsFit, remainingBags);
        if (placeBags > 0) {
          placements.push({ lotId, lot, shelfId: owned.id, shelfCode: owned.code, quantity: placeBags, pool: "OWNED" });
          usedById.set(owned.id, (usedById.get(owned.id) ?? 0) + placeBags * bagSize);
          hasActiveLotById.set(owned.id, true);
          remainingBags -= placeBags;
        }
      }
    }

    if (remainingBags > 0) {
      // Hàng dư trả về Kho mẫu mẹ chung (sản xuất hàng ngày vượt chỗ kệ đã chia) mặc định vào Kho đúng
      // hạn — ưu tiên kệ đã gắn cờ DUNG_HAN, chỉ dùng kệ chung chưa gắn cờ nếu chưa có kệ nào DUNG_HAN
      // (tương thích ngược lúc SUPER_ADMIN chưa phân loại hết kệ).
      const chungPool = candidates.filter(
        (c) => c.roomType === "PHONG_MAU_ME" && !c.assignedStaffId && c.plantTypeId === lot.plantTypeId && c.sharedMotherPool !== "QUA_HAN"
      );
      // Ưu tiên kệ còn nhiều chỗ trống nhất, đủ chứa hết phần dư nếu có; trong đó ưu tiên kệ DUNG_HAN trước.
      chungPool.sort((a, b) => {
        const poolRank = (c: ShelfCandidate) => (c.sharedMotherPool === "DUNG_HAN" ? 0 : 1);
        const rankDiff = poolRank(a) - poolRank(b);
        if (rankDiff !== 0) return rankDiff;
        const leftA = (a.capacity ?? Infinity) - (usedById.get(a.id) ?? 0);
        const leftB = (b.capacity ?? Infinity) - (usedById.get(b.id) ?? 0);
        return leftB - leftA;
      });
      const target = chungPool[0];
      if (!target) {
        throw new ShelfAssignError(
          `Không có kệ Phòng mẫu mẹ chung nào cho mã cây ${lot.plantType.code} — SUPER_ADMIN cần bỏ gán nhân viên 1 kệ để tạo chỗ dự phòng`
        );
      }
      const capLeft = (target.capacity ?? Infinity) - (usedById.get(target.id) ?? 0);
      const bagsFit = Math.floor(capLeft / bagSize);
      if (bagsFit < remainingBags) {
        throw new ShelfAssignError(`Kệ ${target.code} (Kho mẫu mẹ chung) không đủ chỗ cho phần dư của lô ${lot.code}`);
      }
      placements.push({ lotId, lot, shelfId: target.id, shelfCode: target.code, quantity: remainingBags, pool: "SHARED" });
      usedById.set(target.id, (usedById.get(target.id) ?? 0) + remainingBags * bagSize);
    }
  }

  return placements;
}

/**
 * Xếp kệ cho "MM dư" (mẫu mẹ dư) khi CAY_MO bàn giao lúc chỉ định kết thúc do hết thời gian — luôn đưa
 * thẳng vào kệ Kho quá hạn (sharedMotherPool = QUA_HAN) trong Kho mẫu mẹ chung, không đụng tới kệ "đã
 * chia" của bất kỳ NV nào (khác với planShelfAssignments dùng cho bàn giao sản lượng hàng ngày).
 */
export async function planSurplusPlacement(
  transferItems: { lotId: string; lot: LotForAssign }[],
  warehouseId: string
): Promise<ShelfPlacement[]> {
  const shelves = await prisma.shelf.findMany({
    where: {
      warehouseId,
      isActive: true,
      room: { type: "PHONG_MAU_ME" },
      assignedStaffId: null,
      sharedMotherPool: "QUA_HAN",
    },
    include: {
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
    },
  });

  const usedById = new Map(
    shelves.map((s) => [s.id, s.lots.reduce((sum, l) => sum + motherClusterUnits(l.stageCode, l.quantity), 0)])
  );

  const placements: ShelfPlacement[] = [];

  for (const { lotId, lot } of transferItems) {
    const bagSize = MOTHER_SPEC_BAG_SIZE[lot.stageCode as keyof typeof MOTHER_SPEC_BAG_SIZE] ?? 1;
    let remainingBags = lot.quantity;

    const pool = shelves
      .filter((s) => !s.plantTypeId || s.plantTypeId === lot.plantTypeId)
      .sort((a, b) => {
        const leftA = (a.capacity ?? Infinity) - (usedById.get(a.id) ?? 0);
        const leftB = (b.capacity ?? Infinity) - (usedById.get(b.id) ?? 0);
        return leftB - leftA;
      });

    for (const shelf of pool) {
      if (remainingBags <= 0) break;
      const capLeft = (shelf.capacity ?? Infinity) - (usedById.get(shelf.id) ?? 0);
      const bagsFit = Math.max(0, Math.floor(capLeft / bagSize));
      const placeBags = Math.min(bagsFit, remainingBags);
      if (placeBags <= 0) continue;
      placements.push({ lotId, lot, shelfId: shelf.id, shelfCode: shelf.code, quantity: placeBags, pool: "SHARED" });
      usedById.set(shelf.id, (usedById.get(shelf.id) ?? 0) + placeBags * bagSize);
      remainingBags -= placeBags;
    }

    if (remainingBags > 0) {
      throw new ShelfAssignError(
        `Không đủ chỗ ở Kho quá hạn (Kho mẫu mẹ chung) cho lô MM dư ${lot.code} — SUPER_ADMIN cần gắn thêm kệ chung vào Kho quá hạn`
      );
    }
  }

  return placements;
}
