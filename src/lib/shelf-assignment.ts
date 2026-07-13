import { prisma } from "@/lib/prisma";
import { getCurrentWeekSlot } from "@/lib/rooting-week-group";
import { sumLotQuantity } from "@/types";

export class ShelfAssignError extends Error {}

// Kệ "chung" khớp mã cây nếu ít nhất 1 chuỗi trong allowedCodes ("Cho phép xếp") là TIỀN TỐ của mã chi
// tiết loại cây (VD "MT" khớp mọi mã MT001/MT005/MT041..., "MT041" chỉ khớp đúng mã đó).
function matchesAllowedCodes(allowedCodes: string[], plantTypeCode: string): boolean {
  return allowedCodes.some((code) => plantTypeCode.startsWith(code));
}

type LotForAssign = {
  id: string;
  code: string;
  stage: "MAU_ME" | "THANH_PHAM";
  stageCode: string;
  quantity: number;
  plantTypeId: string;
  plantType: { code: string; name: string; rootingWeeks: number; transferWaitWeeks: number };
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
  allowedCodes: string[]; // "Cho phép xếp" — chỉ có ý nghĩa với kệ chung trong Phòng mẫu mẹ
  rotationGroupId: string | null; // Nhóm tuần ra rễ — chỉ có ý nghĩa với PHONG_RA_RE, xem getCurrentWeekSlot
  roomType: "PHONG_MAU_ME" | "PHONG_RA_RE";
  used: number; // số túi hiện có (cả PHONG_MAU_ME lẫn PHONG_RA_RE đều tính theo túi)
};

export type ShelfPlacement = {
  lotId: string;
  lot: LotForAssign;
  shelfId: string;
  shelfCode: string;
  quantity: number; // số túi đặt vào kệ này (có thể nhỏ hơn lot.quantity nếu bị chia do tràn sức chứa kệ)
  pool: "OWNED" | "SHARED" | "RA_RE";
};

/**
 * Nguyên tắc bàn giao Phòng tối → Kho sáng (KHO_MO xác nhận nhận):
 * - Cây ra rễ (THANH_PHAM) → xếp vào kệ Phòng ra rễ, ưu tiên kệ đang dùng ít nhất; nếu kệ có sức chứa
 *   (đơn vị túi) và không đủ chỗ, phần dư tự tràn sang kệ trống kế tiếp (chia lô thành nhiều dòng xếp
 *   kệ). Kệ không đặt sức chứa (capacity = null) coi như không giới hạn.
 * - Mẫu mẹ (MAU_ME, M03/M05) → xếp vào đúng kệ của nhân viên phụ trách (Kho mẫu mẹ đã chia — kệ có
 *   assignedStaffId = NV được giao chỉ định cấy đã tạo ra lô này, và đúng mã cây). Sức chứa kệ Phòng
 *   mẫu mẹ tính theo TÚI (giống Phòng ra rễ), không quy đổi cụm. Kệ đã chia có thể chứa đồng thời cả
 *   M03 lẫn M05 (không còn giới hạn 1 lô/kệ) — chỉ giới hạn bởi sức chứa còn lại (capLeft), giống hệt
 *   cách xếp cây ra rễ. Phần dư vượt sức chứa kệ của NV đó mới tràn sang 1 kệ Phòng mẫu mẹ chưa gán
 *   nhân viên (Kho mẫu mẹ chung) khớp "Cho phép xếp". Hệ thống tự chọn kệ, không cần KHO_MO chọn tay.
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
  // Chỉ áp dụng lọc Nhóm tuần ra rễ nếu có ít nhất 1 Nhóm xoay vòng (rotationKind=RA_RE) đã được
  // SUPER_ADMIN cấu hình ở /settings/shelf-groups VÀ kho này có kệ thuộc 1 trong các Nhóm đó — cho phép
  // các kho chưa dùng cơ chế này tiếp tục xếp theo kiểu cũ (ít dùng nhất trong toàn bộ Phòng ra rễ),
  // tương thích ngược. N (tổng số khe xoay vòng) = tổng số Nhóm rotationKind=RA_RE đang cấu hình, KHÔNG
  // còn hard-code 4 — xem getCurrentWeekSlot.
  const raReGroups = await prisma.shelfGroup.findMany({
    where: { rotationKind: "RA_RE" },
    select: { id: true, rotationOrder: true },
  });
  const currentGroup = raReGroups.length > 0
    ? raReGroups.find((g) => g.rotationOrder === getCurrentWeekSlot(raReGroups.length))
    : undefined;
  const rootingUsesRotationGroup = shelves.some(
    (s) => s.room?.type === "PHONG_RA_RE" && s.rotationGroupId !== null
  );

  const candidates: ShelfCandidate[] = shelves.map((s) => ({
    id: s.id,
    code: s.code,
    capacity: s.capacity,
    plantTypeId: s.plantTypeId,
    assignedStaffId: s.assignedStaffId,
    sharedMotherPool: s.sharedMotherPool,
    allowedCodes: s.allowedCodes,
    rotationGroupId: s.rotationGroupId,
    roomType: s.room!.type as "PHONG_MAU_ME" | "PHONG_RA_RE",
    used: sumLotQuantity(s.lots),
  }));
  const usedById = new Map(candidates.map((c) => [c.id, c.used]));

  const placements: ShelfPlacement[] = [];

  for (const { lotId, lot } of transferItems) {
    if (lot.stage === "THANH_PHAM") {
      let pool = candidates.filter((c) => c.roomType === "PHONG_RA_RE");
      if (pool.length === 0) throw new ShelfAssignError("Không có kệ Phòng ra rễ nào trong kho này");
      if (rootingUsesRotationGroup) {
        if (!currentGroup) {
          throw new ShelfAssignError(
            `Chưa cấu hình Nhóm tuần ra rễ nào — SUPER_ADMIN cần tạo Nhóm ở /settings/shelf-groups`
          );
        }
        const weekPool = pool.filter((c) => c.rotationGroupId === currentGroup.id);
        if (weekPool.length === 0) {
          throw new ShelfAssignError(
            `Chưa có kệ Phòng ra rễ nào được gán Nhóm tuần ra rễ (thứ tự ${currentGroup.rotationOrder}) — SUPER_ADMIN cần cấu hình ở /settings/shelf-groups`
          );
        }
        pool = weekPool;
      }
      pool.sort((a, b) => (usedById.get(a.id) ?? 0) - (usedById.get(b.id) ?? 0));

      let remainingBags = lot.quantity;
      for (const shelf of pool) {
        if (remainingBags <= 0) break;
        const capLeft = (shelf.capacity ?? Infinity) - (usedById.get(shelf.id) ?? 0);
        const placeBags = Math.max(0, Math.min(capLeft, remainingBags));
        if (placeBags <= 0) continue;
        placements.push({ lotId, lot, shelfId: shelf.id, shelfCode: shelf.code, quantity: placeBags, pool: "RA_RE" });
        usedById.set(shelf.id, (usedById.get(shelf.id) ?? 0) + placeBags);
        remainingBags -= placeBags;
      }
      if (remainingBags > 0) {
        throw new ShelfAssignError(`Không đủ chỗ ở Phòng ra rễ cho lô ${lot.code} — SUPER_ADMIN cần thêm kệ hoặc tăng sức chứa`);
      }
      continue;
    }

    const ownerStaffId = lot.instruction?.assignedToId ?? null;
    let remainingBags = lot.quantity;

    if (ownerStaffId) {
      const owned = candidates.find(
        (c) => c.roomType === "PHONG_MAU_ME" && c.assignedStaffId === ownerStaffId && c.plantTypeId === lot.plantTypeId
      );
      if (owned) {
        const capLeft = (owned.capacity ?? Infinity) - (usedById.get(owned.id) ?? 0);
        const placeBags = Math.max(0, Math.min(capLeft, remainingBags));
        if (placeBags > 0) {
          placements.push({ lotId, lot, shelfId: owned.id, shelfCode: owned.code, quantity: placeBags, pool: "OWNED" });
          usedById.set(owned.id, (usedById.get(owned.id) ?? 0) + placeBags);
          remainingBags -= placeBags;
        }
      }
    }

    if (remainingBags > 0) {
      // Hàng dư trả về Kho mẫu mẹ chung (sản xuất hàng ngày vượt chỗ kệ đã chia) mặc định vào Kho đúng
      // hạn — ưu tiên kệ đã gắn cờ DUNG_HAN, chỉ dùng kệ chung chưa gắn cờ nếu chưa có kệ nào DUNG_HAN
      // (tương thích ngược lúc SUPER_ADMIN chưa phân loại hết kệ). Khớp theo "Cho phép xếp" (allowedCodes,
      // tiền tố mã cây) thay cho plantTypeId — kệ chung không còn gán 1 mã cây cố định. Kệ CHƯA cấu hình
      // "Cho phép xếp" (allowedCodes rỗng) coi như nhận mọi mã cây — giống hệt planSurplusPlacement bên
      // dưới, để không chặn cứng luồng bàn giao hàng ngày khi SUPER_ADMIN chưa kịp cấu hình kệ chung nào.
      const chungPool = candidates.filter(
        (c) =>
          c.roomType === "PHONG_MAU_ME" &&
          !c.assignedStaffId &&
          c.sharedMotherPool !== "QUA_HAN" &&
          (c.allowedCodes.length === 0 || matchesAllowedCodes(c.allowedCodes, lot.plantType.code))
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
          `Không có kệ Phòng mẫu mẹ chung nào cho phép xếp mã cây ${lot.plantType.code} — SUPER_ADMIN cần cấu hình "Cho phép xếp" cho 1 kệ chung`
        );
      }
      const capLeft = (target.capacity ?? Infinity) - (usedById.get(target.id) ?? 0);
      if (capLeft < remainingBags) {
        throw new ShelfAssignError(`Kệ ${target.code} (Kho mẫu mẹ chung) không đủ chỗ cho phần dư của lô ${lot.code}`);
      }
      placements.push({ lotId, lot, shelfId: target.id, shelfCode: target.code, quantity: remainingBags, pool: "SHARED" });
      usedById.set(target.id, (usedById.get(target.id) ?? 0) + remainingBags);
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
    select: {
      id: true,
      code: true,
      capacity: true,
      allowedCodes: true,
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
    },
  });

  const usedById = new Map(shelves.map((s) => [s.id, sumLotQuantity(s.lots)]));

  const placements: ShelfPlacement[] = [];

  for (const { lotId, lot } of transferItems) {
    let remainingBags = lot.quantity;

    // Khớp theo "Cho phép xếp" (allowedCodes, tiền tố mã cây) — kệ chưa cấu hình (mảng rỗng) coi như
    // nhận mọi mã cây, giữ tương thích ngược giống hành vi cũ của plantTypeId = null.
    const pool = shelves
      .filter((s) => s.allowedCodes.length === 0 || matchesAllowedCodes(s.allowedCodes, lot.plantType.code))
      .sort((a, b) => {
        const leftA = (a.capacity ?? Infinity) - (usedById.get(a.id) ?? 0);
        const leftB = (b.capacity ?? Infinity) - (usedById.get(b.id) ?? 0);
        return leftB - leftA;
      });

    for (const shelf of pool) {
      if (remainingBags <= 0) break;
      const capLeft = (shelf.capacity ?? Infinity) - (usedById.get(shelf.id) ?? 0);
      const placeBags = Math.max(0, Math.min(capLeft, remainingBags));
      if (placeBags <= 0) continue;
      placements.push({ lotId, lot, shelfId: shelf.id, shelfCode: shelf.code, quantity: placeBags, pool: "SHARED" });
      usedById.set(shelf.id, (usedById.get(shelf.id) ?? 0) + placeBags);
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
