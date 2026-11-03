import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { sumDefects, emptyDefects } from "@/lib/quality-defects";
import type { UserRole } from "@prisma/client";

// "Lịch sử bàn giao thành phẩm" — Quản lý kho thành phẩm xem lại MỌI phiếu bàn giao thành phẩm (Phòng ra rễ
// các khu sản xuất → Kho thành phẩm) trong 1 khoảng ngày, không chỉ phiếu đang chờ nhận như tab "Nhận bàn
// giao thành phẩm" (/goods-receipts, chỉ hiện PENDING) — xuất được Excel (xem
// /api/transfers/finished-history/export). QL Kho TP chỉ xem đúng kho thành phẩm mình làm việc, Admin xem
// mọi kho.
export function canViewFinishedHandoverHistory(role: UserRole | null | undefined): boolean {
  return role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role ?? null);
}

export type FinishedHandoverItemRow = {
  plantTypeCode: string;
  plantTypeName: string;
  stageCode: string;
  quantity: number;
  // null = phiếu chưa được Kho thành phẩm đánh giá chất lượng (chưa nhận, hoặc phiếu cũ trước khi có bước
  // đánh giá) — KHÁC 0 lỗi.
  defectQuantities: number[] | null;
  defectTotal: number | null;
  passedQuantity: number | null;
};

export type FinishedHandoverRow = {
  id: string;
  code: string;
  transferredAt: Date;
  confirmedAt: Date | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  sourceWarehouseName: string | null;
  sourceRoomName: string | null;
  toWarehouseName: string;
  fromUserCode: string;
  fromUserName: string;
  receivedByName: string | null;
  assignedToName: string | null;
  notes: string | null;
  receiveFeedback: string | null;
  totalQuantity: number;
  totalDefect: number | null;
  totalPassed: number | null;
  items: FinishedHandoverItemRow[];
};

// Ngày lọc (yyyy-MM-dd) hiểu theo giờ Việt Nam (UTC+7) — không dùng startOfDay() vì timezone tiến trình
// Node trên VPS không phải giờ VN (xem toVnCalendarDate, src/lib/medium-orders.ts).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function vnDayStart(s: string): Date {
  return new Date(new Date(`${s}T00:00:00Z`).getTime() - VN_OFFSET_MS);
}

export async function computeFinishedHandoverHistory(params: {
  dateFrom?: string | null;
  dateTo?: string | null; // bao gồm hết ngày này
  sourceWarehouseId?: string | null;
  toWarehouseId?: string | null;
  status?: string | null;
}): Promise<FinishedHandoverRow[]> {
  const { dateFrom, dateTo, sourceWarehouseId, toWarehouseId, status } = params;

  const dateRange: { gte?: Date; lt?: Date } = {};
  if (dateFrom && DATE_RE.test(dateFrom)) dateRange.gte = vnDayStart(dateFrom);
  if (dateTo && DATE_RE.test(dateTo)) dateRange.lt = new Date(vnDayStart(dateTo).getTime() + 24 * 60 * 60 * 1000);

  const transfers = await prisma.transfer.findMany({
    where: {
      fromRoom: { type: "PHONG_RA_RE", ...(sourceWarehouseId ? { warehouseId: sourceWarehouseId } : {}) },
      ...(toWarehouseId ? { toWarehouseId } : {}),
      ...(status === "PENDING" || status === "CONFIRMED" || status === "REJECTED" ? { status } : {}),
      ...(dateRange.gte || dateRange.lt ? { transferredAt: dateRange } : {}),
    },
    select: {
      id: true,
      code: true,
      transferredAt: true,
      confirmedAt: true,
      status: true,
      notes: true,
      receiveFeedback: true,
      fromRoom: { select: { name: true, warehouse: { select: { name: true } } } },
      toWarehouse: { select: { name: true } },
      fromUser: { select: { code: true, name: true } },
      toUser: { select: { name: true } },
      assignedTo: { select: { name: true } },
      items: {
        select: {
          quantity: true,
          lot: { select: { stageCode: true, plantTypeId: true, plantType: { select: { code: true, name: true } } } },
        },
      },
      qualityChecks: {
        select: { plantTypeId: true, stageCode: true, defectQuantities: true, checkedBy: { select: { name: true } } },
      },
    },
    orderBy: { transferredAt: "desc" },
    take: 1000,
  });

  return transfers.map((t) => {
    // Đánh giá chất lượng lưu GỘP theo (mã cây, quy cách) — xem TransferQualityCheck — nên gộp các lô của
    // phiếu theo đúng key này để hiển thị khớp.
    const checkByKey = new Map(t.qualityChecks.map((c) => [`${c.plantTypeId}|${c.stageCode}`, c]));
    const groups = new Map<string, FinishedHandoverItemRow>();
    for (const i of t.items) {
      const key = `${i.lot.plantTypeId}|${i.lot.stageCode}`;
      const g = groups.get(key);
      if (g) g.quantity += i.quantity;
      else groups.set(key, {
        plantTypeCode: i.lot.plantType.code,
        plantTypeName: i.lot.plantType.name,
        stageCode: i.lot.stageCode,
        quantity: i.quantity,
        defectQuantities: null,
        defectTotal: null,
        passedQuantity: null,
      });
    }
    for (const [key, g] of groups) {
      const check = checkByKey.get(key);
      if (!check) continue;
      const defects = emptyDefects().map((_, idx) => check.defectQuantities[idx] ?? 0);
      g.defectQuantities = defects;
      g.defectTotal = sumDefects(defects);
      g.passedQuantity = Math.max(0, g.quantity - g.defectTotal);
    }
    const items = [...groups.values()].sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode) || a.stageCode.localeCompare(b.stageCode));
    const hasChecks = t.qualityChecks.length > 0;
    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const totalDefect = hasChecks ? items.reduce((s, i) => s + (i.defectTotal ?? 0), 0) : null;

    return {
      id: t.id,
      code: t.code,
      transferredAt: t.transferredAt,
      confirmedAt: t.confirmedAt,
      status: t.status,
      sourceWarehouseName: t.fromRoom?.warehouse.name ?? null,
      sourceRoomName: t.fromRoom?.name ?? null,
      toWarehouseName: t.toWarehouse.name,
      fromUserCode: t.fromUser.code,
      fromUserName: t.fromUser.name,
      receivedByName: t.toUser?.name ?? t.qualityChecks[0]?.checkedBy.name ?? null,
      assignedToName: t.assignedTo?.name ?? null,
      notes: t.notes,
      receiveFeedback: t.receiveFeedback,
      totalQuantity,
      totalDefect,
      totalPassed: totalDefect === null ? null : Math.max(0, totalQuantity - totalDefect),
      items,
    };
  });
}

// Phạm vi kho đích theo vai trò: QL Kho TP luôn bị khoá vào kho làm việc (undefined = chưa gán kho → không
// được xem gì), Admin lọc tuỳ chọn theo tham số.
export function resolveFinishedHistoryScope(
  role: UserRole | null | undefined,
  workplaceWarehouseId: string | null | undefined,
  requestedToWarehouseId: string | null,
): { toWarehouseId: string | null } | undefined {
  if (role === "QUAN_LY_KHO_THANH_PHAM") return workplaceWarehouseId ? { toWarehouseId: workplaceWarehouseId } : undefined;
  return { toWarehouseId: requestedToWarehouseId || null };
}

export const FINISHED_HANDOVER_STATUS_LABEL: Record<FinishedHandoverRow["status"], string> = {
  PENDING: "Chờ nhận",
  CONFIRMED: "Đã nhận",
  REJECTED: "Từ chối",
};
