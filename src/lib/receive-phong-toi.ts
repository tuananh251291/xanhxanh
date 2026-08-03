import { prisma } from "@/lib/prisma";
import { planShelfAssignments, ShelfAssignError, type ShelfPlacement } from "@/lib/shelf-assignment";
import { commitShelfPlacements } from "@/lib/dark-room-shelf-commit";
import { sumLotQuantity } from "@/types";

// Lô kèm đủ field mà planShelfAssignments/commitShelfPlacements cần (khớp LotForAssign trong
// src/lib/shelf-assignment.ts). Dùng chung cho cả luồng Xanh (gộp theo NV, nhiều phiếu) lẫn Đỏ
// (1 phiếu) — xem receive-phong-toi/route.ts và receive-phong-toi/place/[transferId]/route.ts.
export const lotSelect = {
  id: true,
  code: true,
  stage: true,
  stageCode: true,
  quantity: true,
  plantTypeId: true,
  plantType: { select: { code: true, name: true, rootingWeeks: true, transferWaitWeeks: true } },
  // Ngày lô THẬT SỰ vào Phòng tối — planShelfAssignments dùng làm mốc xác định Nhóm tuần ra rễ (cố định
  // theo ngày nhập, không phụ thuộc lúc nào Transfer được tạo/xác nhận, xem comment ở LotForAssign).
  enteredAt: true,
  instructionId: true,
  instruction: { select: { assignedToId: true, isBackup: true } },
  room: { select: { assignedStaffId: true } },
} as const;

export type PendingItem = {
  id: string;
  lotId: string;
  transferId: string;
  lot: {
    id: string;
    code: string;
    stage: "MAU_ME" | "THANH_PHAM";
    stageCode: string;
    quantity: number;
    plantTypeId: string;
    plantType: { code: string; name: string; rootingWeeks: number; transferWaitWeeks: number };
    enteredAt: Date;
    instructionId: string | null;
    instruction: { assignedToId: string | null; isBackup: boolean } | null;
    room: { assignedStaffId: string | null } | null;
  };
};

// 1 dòng hiển thị = 1 lô (hoặc 1 phần lô nếu bị chia do tràn kệ, VD phần dư mẫu mẹ đưa sang Kho
// chung) đã được xếp vào đúng 1 kệ cụ thể — xem planShelfAssignments (src/lib/shelf-assignment.ts).
export type PlacementRow = {
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  shelfCode: string;
  pool: "OWNED" | "SHARED" | "RA_RE" | "MANUAL";
  isBackup: boolean;
  enteredAt: string;
};

export type StagePreview = {
  rootingPlacements: PlacementRow[];
  motherPlacements: PlacementRow[];
  hasPendingRooting: boolean;
  hasPendingMotherStock: boolean;
  rootingError: string | null;
  motherError: string | null;
  // Tổng số cụm mẫu mẹ đang chờ xếp — tính RIÊNG, không suy từ motherPlacements vì nếu thuật toán lỗi
  // (motherError khác null) thì motherPlacements rỗng nhưng KHO_MO vẫn cần biết tổng để tự nhập kệ thủ
  // công (xem confirmStageManual) đủ đúng số, không thiếu không thừa.
  motherPendingQuantity: number;
  // Có lô nào (mẫu mẹ hoặc cây ra rễ) đến từ chỉ định cấy DỰ PHÒNG hay không — tính RIÊNG từ pendingItems
  // (không suy từ *Placements) vì cần đúng cả khi thuật toán báo lỗi/KHO_MO tự nhập tay, để UI luôn hiện
  // được thông báo dù ở nhánh nào. Dùng để hiện banner nhắc KHO_MO (xem place-staff-board.tsx/place-board.tsx).
  motherHasBackup: boolean;
  rootingHasBackup: boolean;
};

function toPlacementRows(placements: Awaited<ReturnType<typeof planShelfAssignments>>): PlacementRow[] {
  return placements.map((p) => ({
    plantTypeCode: p.lot.plantType.code,
    plantTypeName: p.lot.plantType.name,
    stageCode: p.lot.stageCode,
    quantity: p.quantity,
    shelfCode: p.shelfCode,
    pool: p.pool,
    isBackup: !!p.lot.instruction?.isBackup,
    enteredAt: p.lot.enteredAt.toISOString(),
  }));
}

// Xem trước (không ghi DB) kết quả xếp kệ cho 1 tập TransferItem đang chờ — dùng cho cả trang liệt
// kê luồng Xanh (gộp nhiều phiếu của 1 NV) lẫn trang "Sắp xếp về kho" của luồng Đỏ (1 phiếu).
export async function buildStagePreview(pendingItems: PendingItem[], workplaceWarehouseId: string): Promise<StagePreview> {
  const rootingItems = pendingItems.filter((i) => i.lot.stage === "THANH_PHAM");
  const motherItems = pendingItems.filter((i) => i.lot.stage === "MAU_ME");

  let rootingPlacements: PlacementRow[] = [];
  let rootingError: string | null = null;
  if (rootingItems.length > 0) {
    try {
      const preview = await planShelfAssignments(rootingItems.map((i) => ({ lotId: i.lotId, lot: i.lot })), workplaceWarehouseId);
      rootingPlacements = toPlacementRows(preview);
    } catch (e) {
      rootingError = e instanceof ShelfAssignError ? e.message : "Lỗi không xác định";
    }
  }

  let motherPlacements: PlacementRow[] = [];
  let motherError: string | null = null;
  if (motherItems.length > 0) {
    try {
      const preview = await planShelfAssignments(motherItems.map((i) => ({ lotId: i.lotId, lot: i.lot })), workplaceWarehouseId);
      motherPlacements = toPlacementRows(preview);
    } catch (e) {
      motherError = e instanceof ShelfAssignError ? e.message : "Lỗi không xác định";
    }
  }

  return {
    rootingPlacements,
    motherPlacements,
    hasPendingRooting: rootingItems.length > 0,
    hasPendingMotherStock: motherItems.length > 0,
    rootingError,
    motherError,
    motherPendingQuantity: motherItems.reduce((s, i) => s + i.lot.quantity, 0),
    motherHasBackup: motherItems.some((i) => i.lot.instruction?.isBackup),
    rootingHasBackup: rootingItems.some((i) => i.lot.instruction?.isBackup),
  };
}

// Ghi DB phần chung cho cả 2 đường xếp kệ (theo thuật toán hoặc KHO_MO tự nhập) — đánh dấu confirmedAt
// cho từng item và tự chuyển Transfer sang CONFIRMED khi hết item chưa xếp.
async function applyPlacements(pendingItemsForStage: PendingItem[], placements: ShelfPlacement[]): Promise<void> {
  const touchedTransferIds = [...new Set(pendingItemsForStage.map((i) => i.transferId))];

  await prisma.$transaction(async (tx) => {
    await commitShelfPlacements(tx, placements);
    await tx.transferItem.updateMany({ where: { id: { in: pendingItemsForStage.map((i) => i.id) } }, data: { confirmedAt: new Date() } });
    for (const transferId of touchedTransferIds) {
      const remaining = await tx.transferItem.count({ where: { transferId, confirmedAt: null } });
      if (remaining === 0) {
        await tx.transfer.update({ where: { id: transferId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      }
    }
  });
}

// Xếp kệ thật (ghi DB) cho 1 nhóm item cùng stage (THANH_PHAM hoặc MAU_ME) — theo đúng nguyên tắc tự
// động (planShelfAssignments) — có thể đến từ nhiều phiếu bàn giao khác nhau (luồng Xanh, gộp theo NV)
// hoặc chỉ 1 phiếu (luồng Đỏ).
export async function confirmStage(pendingItemsForStage: PendingItem[], workplaceWarehouseId: string): Promise<ShelfPlacement[]> {
  const placements = await planShelfAssignments(
    pendingItemsForStage.map((i) => ({ lotId: i.lotId, lot: i.lot })),
    workplaceWarehouseId
  );
  await applyPlacements(pendingItemsForStage, placements);
  return placements;
}

export type ManualPlacementInput = { shelfCode: string; quantity: number };

// Xếp kệ mẫu mẹ THEO TAY KHO_MO nhập (bỏ qua planShelfAssignments) — dùng cho các trường hợp phát sinh
// mà nguyên tắc tự động không xử lý được (VD báo lỗi hết chỗ nhưng thực tế KHO_MO biết còn chỗ khác phù
// hợp hơn, hoặc muốn xếp khác đi vì lý do vận hành). CHỈ áp dụng cho mẫu mẹ (MAU_ME) — không hỗ trợ cây
// ra rễ. Không bỏ qua sức chứa — vẫn chặn cứng nếu tổng nhập cho 1 kệ vượt quá chỗ trống thật của kệ đó
// (giống hệt nhánh tự động), chỉ khác là KHO_MO tự chọn đích đến thay vì để thuật toán chọn. Ràng buộc:
// kệ phải tồn tại, đang hoạt động, đúng Phòng mẫu mẹ, đúng kho; không vượt sức chứa còn trống; và tổng
// số cụm nhập phải khớp CHÍNH XÁC tổng mẫu mẹ đang chờ xếp (không thiếu không thừa, giống hệt ràng buộc
// của nhánh tự động — luôn xếp hết 100%, không cho xếp dở dang).
export async function confirmStageManual(
  pendingItemsForStage: PendingItem[],
  manualPlacements: ManualPlacementInput[],
  workplaceWarehouseId: string
): Promise<ShelfPlacement[]> {
  const motherItems = pendingItemsForStage.filter((i) => i.lot.stage === "MAU_ME");
  if (motherItems.length !== pendingItemsForStage.length) {
    throw new ShelfAssignError("Tự nhập kệ chỉ áp dụng cho mẫu mẹ");
  }
  if (manualPlacements.length === 0) {
    throw new ShelfAssignError("Cần nhập ít nhất 1 dòng kệ");
  }

  const totalPending = motherItems.reduce((s, i) => s + i.lot.quantity, 0);
  const totalManual = manualPlacements.reduce((s, m) => s + m.quantity, 0);
  if (totalManual !== totalPending) {
    throw new ShelfAssignError(
      `Tổng số cụm đã nhập (${totalManual.toLocaleString("vi-VN")}) phải khớp đúng tổng mẫu mẹ đang chờ xếp (${totalPending.toLocaleString("vi-VN")})`
    );
  }

  const shelfCodes = [...new Set(manualPlacements.map((m) => m.shelfCode.trim().toUpperCase()))];
  const shelves = await prisma.shelf.findMany({
    where: { code: { in: shelfCodes }, warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    select: {
      id: true,
      code: true,
      capacity: true,
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
      rotationGroup: { select: { rotationOrder: true } },
    },
  });
  const shelfByCode = new Map(shelves.map((s) => [s.code, s]));
  const missing = shelfCodes.filter((c) => !shelfByCode.has(c));
  if (missing.length > 0) {
    throw new ShelfAssignError(`Không tìm thấy kệ Phòng mẫu mẹ đang hoạt động thuộc kho này với mã: ${missing.join(", ")}`);
  }

  // Kiểm tra sức chứa — cộng dồn TẤT CẢ các dòng KHO_MO nhập cho CÙNG 1 kệ (có thể nhập nhiều dòng cùng
  // 1 kệ) trước khi so với chỗ trống thật của kệ đó (capacity - tồn hiện có), không cho vượt quá dù là
  // xếp thủ công. Kệ chưa đặt sức chứa (capacity = null) coi như không giới hạn, giống hệt nhánh tự động.
  const addedByShelfId = new Map<string, number>();
  for (const m of manualPlacements) {
    const shelf = shelfByCode.get(m.shelfCode.trim().toUpperCase())!;
    addedByShelfId.set(shelf.id, (addedByShelfId.get(shelf.id) ?? 0) + m.quantity);
  }
  const overCapacity: string[] = [];
  for (const [shelfId, added] of addedByShelfId) {
    const shelf = shelves.find((s) => s.id === shelfId)!;
    if (shelf.capacity === null) continue;
    const capLeft = shelf.capacity - sumLotQuantity(shelf.lots);
    if (added > capLeft) {
      overCapacity.push(`${shelf.code} (còn trống ${Math.max(0, capLeft).toLocaleString("vi-VN")} cụm, đang nhập ${added.toLocaleString("vi-VN")} cụm)`);
    }
  }
  if (overCapacity.length > 0) {
    throw new ShelfAssignError(`Vượt sức chứa kệ: ${overCapacity.join("; ")}`);
  }

  // Ghép nối tuần tự: từng lô đang chờ (theo thứ tự) được "rót" lần lượt vào các dòng KHO_MO đã nhập,
  // tự tách nếu 1 dòng không đủ hết 1 lô hoặc 1 lô tràn sang nhiều dòng — giống cách planShelfAssignments
  // chia lô khi tràn kệ, chỉ khác là thứ tự/đích đến do KHO_MO quyết định thay vì thuật toán.
  const manualQueue = manualPlacements.map((m) => ({
    shelf: shelfByCode.get(m.shelfCode.trim().toUpperCase())!,
    remaining: m.quantity,
  }));
  const placements: ShelfPlacement[] = [];
  let queueIdx = 0;
  for (const item of motherItems) {
    let remaining = item.lot.quantity;
    while (remaining > 0) {
      const current = manualQueue[queueIdx];
      if (!current) throw new ShelfAssignError("Không đủ số cụm đã nhập để xếp hết mẫu mẹ đang chờ");
      const take = Math.min(remaining, current.remaining);
      placements.push({ lotId: item.lotId, lot: item.lot, shelfId: current.shelf.id, shelfCode: current.shelf.code, quantity: take, pool: "MANUAL", rotationOrder: current.shelf.rotationGroup?.rotationOrder ?? null });
      current.remaining -= take;
      remaining -= take;
      if (current.remaining <= 0) queueIdx++;
    }
  }

  await applyPlacements(motherItems, placements);
  return placements;
}
