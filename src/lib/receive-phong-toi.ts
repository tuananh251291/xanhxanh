import { prisma } from "@/lib/prisma";
import { planShelfAssignments, ShelfAssignError, type ShelfPlacement } from "@/lib/shelf-assignment";
import { commitShelfPlacements } from "@/lib/dark-room-shelf-commit";

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
  instructionId: true,
  instruction: { select: { assignedToId: true } },
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
    instructionId: string | null;
    instruction: { assignedToId: string | null } | null;
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
  pool: "OWNED" | "SHARED" | "RA_RE";
};

export type StagePreview = {
  rootingPlacements: PlacementRow[];
  motherPlacements: PlacementRow[];
  hasPendingRooting: boolean;
  hasPendingMotherStock: boolean;
  rootingError: string | null;
  motherError: string | null;
};

function toPlacementRows(placements: Awaited<ReturnType<typeof planShelfAssignments>>): PlacementRow[] {
  return placements.map((p) => ({
    plantTypeCode: p.lot.plantType.code,
    plantTypeName: p.lot.plantType.name,
    stageCode: p.lot.stageCode,
    quantity: p.quantity,
    shelfCode: p.shelfCode,
    pool: p.pool,
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
  };
}

// Xếp kệ thật (ghi DB) cho 1 nhóm item cùng stage (THANH_PHAM hoặc MAU_ME) — có thể đến từ nhiều
// phiếu bàn giao khác nhau (luồng Xanh, gộp theo NV) hoặc chỉ 1 phiếu (luồng Đỏ). Đánh dấu
// confirmedAt cho từng item và tự chuyển Transfer sang CONFIRMED khi hết item chưa xếp.
export async function confirmStage(pendingItemsForStage: PendingItem[], workplaceWarehouseId: string): Promise<ShelfPlacement[]> {
  const placements = await planShelfAssignments(
    pendingItemsForStage.map((i) => ({ lotId: i.lotId, lot: i.lot })),
    workplaceWarehouseId
  );

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

  return placements;
}
