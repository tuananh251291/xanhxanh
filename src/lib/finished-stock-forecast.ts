import { addMonths, startOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/inventory";
import { ensureExpiredOrdersCancelled } from "@/lib/order-lifecycle";
import { computeRootingExpectedMoveAt } from "@/lib/rooting-week-group";
import { getRotationEpochResolver, resolveRotationEpoch } from "@/lib/rotation-epoch";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import {
  DEFAULT_FORECAST_RATE_PCT, FORECAST_RATE_KEY, computeForecastRows,
  type ForecastInput, type ForecastRow,
} from "@/lib/finished-stock-forecast-calc";

// Trang "Tồn kho dự kiến" — giai đoạn đầu CHỈ để xem + đối chiếu số, chưa nối vào luồng tạo đơn hàng.
export function canViewFinishedForecast(role: UserRole | null | undefined): boolean {
  return role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role ?? null);
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
// Ngày theo giờ Việt Nam — không dùng format() của date-fns vì phụ thuộc timezone tiến trình Node trên VPS.
export const toVnDateKey = (d: Date) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

export async function getForecastRatePct(): Promise<number> {
  const value = parseInt(await getSystemConfig(FORECAST_RATE_KEY, String(DEFAULT_FORECAST_RATE_PCT)), 10);
  return Number.isNaN(value) || value < 0 || value > 100 ? DEFAULT_FORECAST_RATE_PCT : value;
}

export type FinishedForecastResult = {
  ratePct: number;
  roomFound: boolean;
  rows: (ForecastRow & { code: string; name: string })[];
  lateSupplierPlans: { code: string; supplierName: string; expectedKey: string; quantity: number }[];
};

export async function computeFinishedForecast(warehouseId: string, dateKey: string, now: Date = new Date()): Promise<FinishedForecastResult> {
  await ensureExpiredOrdersCancelled();
  const todayKey = toVnDateKey(now);
  const ratePct = await getForecastRatePct();

  const room = await prisma.room.findFirst({
    where: { warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true },
    select: { id: true },
  });
  if (!room) return { ratePct, roomFound: false, rows: [], lateSupplierPlans: [] };

  const [stockLots, shelfLots, entries, plans, orderItems, rootingSlots, epochResolver] = await Promise.all([
    prisma.lot.findMany({
      where: { roomId: room.id, status: "ACTIVE", quantity: { gt: 0 } },
      select: { plantTypeId: true, stageCode: true, quantity: true },
    }),
    prisma.lot.findMany({
      where: { stage: "THANH_PHAM", status: "ACTIVE", quantity: { gt: 0 }, shelf: { room: { type: "PHONG_RA_RE" } } },
      select: {
        plantTypeId: true, stageCode: true, quantity: true, enteredAt: true, expectedMoveAt: true,
        plantType: { select: { rootingWeeks: true } },
        shelf: { select: { roomId: true, warehouseId: true, rotationGroupId: true, rotationGroup: { select: { rotationKind: true, rotationOrder: true } } } },
        // Phiếu bàn giao đang chờ Kho thành phẩm này nhận — lô chỉ bị trừ khi nhận xong (PATCH /api/transfers/[id]).
        transferItems: { where: { transfer: { status: "PENDING", toWarehouseId: warehouseId } }, select: { quantity: true } },
      },
    }),
    prisma.rootingForecastEntry.findMany({ select: { plantTypeId: true, taskMonth: true, quantity1: true, quantity2: true, quantity3: true } }),
    prisma.goodsReceipt.findMany({
      where: { status: "PLANNED", supplierId: { not: null }, roomId: room.id, expectedDate: { not: null } },
      select: {
        code: true, expectedDate: true, supplier: { select: { name: true } },
        items: { select: { plantTypeId: true, stageCode: true, quantityDelivered: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: {
        order: { status: { in: ["HELD", "CONFIRMED"] } },
        lot: { roomId: room.id },
        // Dòng đã xử lý xong: tồn thực đã trừ thật, không trừ đôi — cùng điều kiện với getQualifiedLots.
        OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
      },
      select: {
        quantity: true,
        lot: { select: { plantTypeId: true, stageCode: true } },
        order: { select: { code: true, status: true, expectedShipAt: true } },
      },
    }),
    prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
    getRotationEpochResolver("RA_RE"),
  ]);

  // Đánh giá chất lượng lưu theo (phòng, Nhóm, tuần xuất). Lô được lùi sang Nhóm kế tiếp sau đánh giá có
  // enteredAt mới hơn completedAt của đánh giá Nhóm đó nên vẫn tính là chưa đánh giá.
  const evaluations = await prisma.rootingQualityEvaluation.findMany({
    where: { status: "COMPLETED", completedAt: { not: null } },
    select: { roomId: true, rotationGroupId: true, weekStart: true, completedAt: true },
  });
  const evaluationKey = (roomId: string, groupId: string, weekKey: string) => `${roomId}|${groupId}|${weekKey}`;
  const evaluatedAt = new Map(
    evaluations.map((e) => [evaluationKey(e.roomId, e.rotationGroupId, e.weekStart.toISOString().slice(0, 10)), e.completedAt!])
  );

  const rootingLots: ForecastInput["rootingLots"] = shelfLots.map((lot) => {
    const group = lot.shelf?.rotationGroup;
    const epoch = lot.shelf ? resolveRotationEpoch(epochResolver, lot.shelf.warehouseId) : undefined;
    const due = group?.rotationKind === "RA_RE" && group.rotationOrder != null && epoch
      ? computeRootingExpectedMoveAt(lot.plantType.rootingWeeks, lot.enteredAt, group.rotationOrder, rootingSlots, epoch)
      : lot.expectedMoveAt ?? computeRootingExpectedMoveAt(lot.plantType.rootingWeeks, lot.enteredAt, null, 0, undefined);
    const weekKey = toStoredWeekStart(startOfWeek(due, { weekStartsOn: 1 })).toISOString().slice(0, 10);
    const completedAt = lot.shelf?.rotationGroupId && lot.shelf.roomId
      ? evaluatedAt.get(evaluationKey(lot.shelf.roomId, lot.shelf.rotationGroupId, weekKey))
      : undefined;
    return {
      plantTypeId: lot.plantTypeId,
      stageCode: lot.stageCode,
      quantity: lot.quantity,
      pendingQuantity: lot.transferItems.reduce((s, i) => s + i.quantity, 0),
      dueKey: toVnDateKey(due),
      evaluated: !!completedAt && lot.enteredAt <= completedAt,
    };
  });

  // taskMonth M: quantity1/2/3 là số đăng ký cho tháng M+1/M+2/M+3 (xem RootingForecastEntry).
  const registered: ForecastInput["registered"] = entries.flatMap((e) =>
    [e.quantity1, e.quantity2, e.quantity3].map((quantity, i) => ({
      plantTypeId: e.plantTypeId,
      monthKey: addMonths(e.taskMonth, i + 1).toISOString().slice(0, 7),
      quantity,
    }))
  );

  const lateSupplierPlans: FinishedForecastResult["lateSupplierPlans"] = [];
  const supplierPlans: ForecastInput["supplierPlans"] = [];
  for (const plan of plans) {
    const expectedKey = toVnDateKey(plan.expectedDate!);
    const supplierName = plan.supplier?.name ?? "";
    if (expectedKey < todayKey) {
      lateSupplierPlans.push({ code: plan.code, supplierName, expectedKey, quantity: plan.items.reduce((s, i) => s + i.quantityDelivered, 0) });
      continue;
    }
    for (const item of plan.items) {
      supplierPlans.push({ plantTypeId: item.plantTypeId, stageCode: item.stageCode, quantity: item.quantityDelivered, dateKey: expectedKey, note: `${plan.code} · ${supplierName}` });
    }
  }

  const orders: ForecastInput["orders"] = orderItems.map((i) => ({
    plantTypeId: i.lot.plantTypeId,
    stageCode: i.lot.stageCode,
    quantity: i.quantity,
    // Đơn cũ không có ngày xuất: coi như xuất ngay để không đánh giá cao tồn.
    dateKey: i.order.expectedShipAt ? toVnDateKey(i.order.expectedShipAt) : todayKey,
    note: `${i.order.code} · ${i.order.status === "HELD" ? "Tạm giữ" : "Đã xác nhận"}`,
  }));

  const rows = computeForecastRows({ todayKey, ratePct, rootingSlots, stock: stockLots, rootingLots, registered, supplierPlans, orders }, dateKey);
  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: rows.map((r) => r.plantTypeId) } },
    select: { id: true, code: true, name: true },
  });
  const plantById = new Map(plantTypes.map((p) => [p.id, p]));

  return {
    ratePct,
    roomFound: true,
    rows: rows
      .map((r) => ({ ...r, code: plantById.get(r.plantTypeId)?.code ?? "", name: plantById.get(r.plantTypeId)?.name ?? "" }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    lateSupplierPlans,
  };
}
