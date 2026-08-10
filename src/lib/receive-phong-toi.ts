import { prisma } from "@/lib/prisma";
import { planShelfAssignments, planSurplusPlacement, ShelfAssignError, type ShelfPlacement } from "@/lib/shelf-assignment";
import { commitShelfPlacements } from "@/lib/dark-room-shelf-commit";
import { sumLotQuantity, SURPLUS_TRANSFER_TAG } from "@/types";

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
  // Chỉ để truyền qua cho lô con khi tách (xem commitShelfPlacements) — không đọc trực tiếp ở đây.
  darkRoomEnteredAt: true,
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
    darkRoomEnteredAt: Date | null;
    instructionId: string | null;
    instruction: { assignedToId: string | null; isBackup: boolean } | null;
    room: { assignedStaffId: string | null } | null;
  };
};

// Danh sách phiếu bàn giao Phòng tối đang chờ (chưa xếp hết) của 1 NV luồng Xanh, gộp mọi Transfer
// PENDING của họ lại — 1 NV có thể gửi nhiều phiếu khác ngày trước khi Kho mô xử lý. Dùng chung cho cả
// GET/POST /api/transfers/receive-phong-toi (danh sách + xác nhận xếp) lẫn GET .../place-staff/[staffId]
// (xem preview kệ gợi ý cho riêng 1 NV, tách khỏi danh sách để không tính toán thừa — xem buildStagePreview).
export async function findPendingItems(
  staffId: string
): Promise<{ items: PendingItem[]; transfers: { id: string; code: string; transferredAt: Date }[] }> {
  const transfers = await prisma.transfer.findMany({
    where: {
      status: "PENDING",
      fromUserId: staffId,
      fromRoom: { type: "PHONG_TOI" },
      // notes là field nullable — Prisma dịch `not` thành SQL `<>`, tự động loại cả các dòng NULL
      // (đa số phiếu thường không phải surplus nên notes luôn null). Phải liệt kê rõ null lẫn "khác
      // SURPLUS_TRANSFER_TAG" bằng OR để không vô tình loại hết phiếu bình thường.
      OR: [{ notes: null }, { notes: { not: SURPLUS_TRANSFER_TAG } }],
    },
    select: {
      id: true,
      code: true,
      transferredAt: true,
      items: {
        where: { confirmedAt: null },
        select: { id: true, lotId: true, transferId: true, lot: { select: lotSelect } },
      },
    },
    orderBy: { transferredAt: "asc" },
  });
  const withPendingItems = transfers.filter((t) => t.items.length > 0);
  return {
    items: withPendingItems.flatMap((t) => t.items),
    transfers: withPendingItems.map((t) => ({ id: t.id, code: t.code, transferredAt: t.transferredAt })),
  };
}

// 1 dòng đặt kệ = 1 phần của lô (có thể tràn sang nhiều kệ, VD phần dư mẫu mẹ đưa sang Kho chung) —
// xem planShelfAssignments (src/lib/shelf-assignment.ts).
export type PlacementLine = { shelfCode: string; quantity: number; pool: "OWNED" | "SHARED" | "RA_RE" | "MANUAL" };

// 1 NHÓM = ĐÚNG 1 LÔ (1 mã cây + 1 quy cách) đang chờ xếp — xác nhận/tự nhập kệ theo TỪNG nhóm độc lập
// (không gộp chung cả đợt như trước), để KHO_MO xử lý xong lô này thì xác nhận ngay, không phải chờ xử lý
// xong hết mọi lô khác trong cùng phiếu/đợt mới xác nhận được lô đầu tiên.
export type LotGroup = {
  lotId: string;
  lotCode: string;
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  enteredAt: string;
  isBackup: boolean;
  placements: PlacementLine[];
  error: string | null;
};

export type StagePreview = {
  rootingGroups: LotGroup[];
  motherGroups: LotGroup[];
  hasPendingRooting: boolean;
  hasPendingMotherStock: boolean;
};

// Chạy thuật toán RIÊNG cho TỪNG lô (không gộp chung 1 lần gọi planShelfAssignments như trước) — để xem
// trước ĐÚNG kết quả sẽ xảy ra nếu xác nhận CHỈ lô này ngay bây giờ (độc lập với các lô khác còn đang chờ
// trong cùng đợt, vì chúng chưa thật sự chiếm chỗ kệ nào cho tới khi được xác nhận riêng). Chạy song
// song (Promise.all) vì mỗi lô chỉ đọc dữ liệu (preview), không ghi gì cả. isSurplus = true (phiếu bàn
// giao MM dư, xem SURPLUS_TRANSFER_TAG) dùng planSurplusPlacement (luôn về Kho quá hạn) thay vì
// planShelfAssignments (kệ đã chia của NV + Kho mẫu mẹ chung thường).
async function buildLotGroups(items: PendingItem[], workplaceWarehouseId: string, isSurplus: boolean): Promise<LotGroup[]> {
  return Promise.all(
    items.map(async (item): Promise<LotGroup> => {
      let placements: ShelfPlacement[] = [];
      let error: string | null = null;
      try {
        placements = isSurplus
          ? await planSurplusPlacement([{ lotId: item.lotId, lot: item.lot }], workplaceWarehouseId)
          : await planShelfAssignments([{ lotId: item.lotId, lot: item.lot }], workplaceWarehouseId);
      } catch (e) {
        error = e instanceof ShelfAssignError ? e.message : "Lỗi không xác định";
      }
      return {
        lotId: item.lotId,
        lotCode: item.lot.code,
        plantTypeCode: item.lot.plantType.code,
        plantTypeName: item.lot.plantType.name,
        stageCode: item.lot.stageCode,
        quantity: item.lot.quantity,
        enteredAt: item.lot.enteredAt.toISOString(),
        isBackup: !!item.lot.instruction?.isBackup,
        placements: placements.map((p) => ({ shelfCode: p.shelfCode, quantity: p.quantity, pool: p.pool })),
        error,
      };
    })
  );
}

// Xem trước (không ghi DB) kết quả xếp kệ cho 1 tập TransferItem đang chờ — dùng cho cả trang liệt
// kê luồng Xanh (gộp nhiều phiếu của 1 NV) lẫn trang "Sắp xếp về kho" của luồng Đỏ (1 phiếu) lẫn phiếu
// MM dư (isSurplus — luôn chỉ có mother items, không có rooting).
export async function buildStagePreview(pendingItems: PendingItem[], workplaceWarehouseId: string, isSurplus = false): Promise<StagePreview> {
  const rootingItems = pendingItems.filter((i) => i.lot.stage === "THANH_PHAM");
  const motherItems = pendingItems.filter((i) => i.lot.stage === "MAU_ME");

  const [rootingGroups, motherGroups] = await Promise.all([
    buildLotGroups(rootingItems, workplaceWarehouseId, false),
    buildLotGroups(motherItems, workplaceWarehouseId, isSurplus),
  ]);

  return {
    rootingGroups,
    motherGroups,
    hasPendingRooting: rootingItems.length > 0,
    hasPendingMotherStock: motherItems.length > 0,
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
// động (planShelfAssignments, hoặc planSurplusPlacement nếu isSurplus) — có thể đến từ nhiều phiếu bàn
// giao khác nhau (luồng Xanh, gộp theo NV) hoặc chỉ 1 phiếu (luồng Đỏ/MM dư).
export async function confirmStage(pendingItemsForStage: PendingItem[], workplaceWarehouseId: string, isSurplus = false): Promise<ShelfPlacement[]> {
  const placements = isSurplus
    ? await planSurplusPlacement(
        pendingItemsForStage.map((i) => ({ lotId: i.lotId, lot: i.lot })),
        workplaceWarehouseId
      )
    : await planShelfAssignments(
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
