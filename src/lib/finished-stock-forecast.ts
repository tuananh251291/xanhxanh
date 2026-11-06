import { addMonths, startOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getSystemConfig } from "@/lib/inventory";
import { ensureExpiredOrdersCancelled } from "@/lib/order-lifecycle";
import { computeRootingExpectedMoveAt } from "@/lib/rooting-week-group";
import { getRotationEpochResolver, resolveRotationEpoch } from "@/lib/rotation-epoch";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { isAdminRole } from "@/types";
import type { Prisma, UserRole } from "@prisma/client";
import {
  DEFAULT_FORECAST_RATE_PCT, FORECAST_RATE_KEY, FORECAST_REGISTERED_UPLOAD_KEY, buildForecastEvents, computeForecastRows, lineAvailability, lineBalance, shipCutoffKey,
  type ForecastInput, type ForecastRow,
} from "@/lib/finished-stock-forecast-calc";

type Client = Prisma.TransactionClient | typeof prisma;

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

// Số đăng ký sản xuất tải từ file, { "yyyy-MM": { plantTypeId: số cây } } — tháng có ở đây thay cho số trong bảng
// RootingForecastEntry của tháng đó. Lưu riêng để không đổi chỉ tiêu cây ra rễ của NV cấy mô (đọc từ bảng đó).
export type UploadedRegistered = Record<string, Record<string, number>>;

export async function getUploadedRegistered(): Promise<UploadedRegistered> {
  const raw = await getSystemConfig(FORECAST_REGISTERED_UPLOAD_KEY, "");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as UploadedRegistered;
  } catch {
    return {};
  }
}

export async function saveUploadedRegistered(data: UploadedRegistered): Promise<void> {
  const value = JSON.stringify(data);
  await prisma.systemConfig.upsert({
    where: { key: FORECAST_REGISTERED_UPLOAD_KEY },
    create: { key: FORECAST_REGISTERED_UPLOAD_KEY, value, description: "Số đăng ký sản xuất tải từ file cho Tồn kho dự kiến (JSON)" },
    update: { value },
  });
}

const getDatRoomId = async (warehouseId: string, client: Client = prisma) =>
  (await client.room.findFirst({ where: { warehouseId, type: "PHONG_DAT_TIEU_CHUAN", isActive: true }, select: { id: true } }))?.id ?? null;

type Supply = Pick<ForecastInput, "todayKey" | "ratePct" | "rootingSlots" | "rootingLots" | "registered" | "supplierPlans"> & {
  lateSupplierPlans: { code: string; supplierName: string; expectedKey: string; quantity: number }[];
};

// Phần hàng sắp về (lô khu sản xuất, số đăng ký, NCC) — đọc NGOÀI transaction tạo đơn: các bảng này đổi liên tục, đọc
// trong transaction Serializable sẽ làm đơn hay bị huỷ giả.
async function loadSupply(roomId: string, warehouseId: string, now: Date, plantTypeIds?: string[]): Promise<Supply> {
  const todayKey = toVnDateKey(now);
  const plantFilter = plantTypeIds ? { plantTypeId: { in: plantTypeIds } } : {};
  const [ratePct, uploaded, shelfLots, entries, plans, rootingSlots, epochResolver, evaluations] = await Promise.all([
    getForecastRatePct(),
    getUploadedRegistered(),
    prisma.lot.findMany({
      where: { ...plantFilter, stage: "THANH_PHAM", status: "ACTIVE", quantity: { gt: 0 }, shelf: { room: { type: "PHONG_RA_RE" } } },
      select: {
        plantTypeId: true, stageCode: true, quantity: true, enteredAt: true, expectedMoveAt: true,
        plantType: { select: { rootingWeeks: true } },
        shelf: { select: { roomId: true, warehouseId: true, rotationGroupId: true, rotationGroup: { select: { rotationKind: true, rotationOrder: true } } } },
        // Phiếu bàn giao đang chờ Kho thành phẩm này nhận — lô chỉ bị trừ khi nhận xong (PATCH /api/transfers/[id]).
        transferItems: { where: { transfer: { status: "PENDING", toWarehouseId: warehouseId } }, select: { quantity: true } },
      },
    }),
    prisma.rootingForecastEntry.findMany({ where: plantFilter, select: { plantTypeId: true, taskMonth: true, quantity1: true, quantity2: true, quantity3: true } }),
    prisma.goodsReceipt.findMany({
      where: { status: "PLANNED", supplierId: { not: null }, roomId, expectedDate: { not: null } },
      select: {
        code: true, expectedDate: true, supplier: { select: { name: true } },
        items: { select: { plantTypeId: true, stageCode: true, quantityDelivered: true } },
      },
    }),
    prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
    getRotationEpochResolver("RA_RE"),
    // Đánh giá chất lượng lưu theo (phòng, Nhóm, tuần xuất). Lô được lùi sang Nhóm kế tiếp sau đánh giá có enteredAt
    // mới hơn completedAt của đánh giá Nhóm đó nên vẫn tính là chưa đánh giá.
    prisma.rootingQualityEvaluation.findMany({
      where: { status: "COMPLETED", completedAt: { not: null } },
      select: { roomId: true, rotationGroupId: true, weekStart: true, completedAt: true },
    }),
  ]);

  const evaluationKey = (evalRoomId: string, groupId: string, weekKey: string) => `${evalRoomId}|${groupId}|${weekKey}`;
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
  ).filter((r) => !uploaded[r.monthKey]);
  for (const [monthKey, rows] of Object.entries(uploaded)) {
    for (const [plantTypeId, quantity] of Object.entries(rows)) {
      if (!plantTypeIds || plantTypeIds.includes(plantTypeId)) registered.push({ plantTypeId, monthKey, quantity });
    }
  }

  const lateSupplierPlans: Supply["lateSupplierPlans"] = [];
  const supplierPlans: ForecastInput["supplierPlans"] = [];
  for (const plan of plans) {
    const expectedKey = toVnDateKey(plan.expectedDate!);
    const supplierName = plan.supplier?.name ?? "";
    if (expectedKey < todayKey) {
      lateSupplierPlans.push({ code: plan.code, supplierName, expectedKey, quantity: plan.items.reduce((s, i) => s + i.quantityDelivered, 0) });
      continue;
    }
    for (const item of plan.items) {
      if (plantTypeIds && !plantTypeIds.includes(item.plantTypeId)) continue;
      supplierPlans.push({ plantTypeId: item.plantTypeId, stageCode: item.stageCode, quantity: item.quantityDelivered, dateKey: expectedKey, note: `${plan.code} · ${supplierName}` });
    }
  }

  return { todayKey, ratePct, rootingSlots, rootingLots, registered, supplierPlans, lateSupplierPlans };
}

// Phần tồn thực + đơn chưa xuất — đọc được trong transaction tạo đơn để 2 đơn cùng lúc không giữ trùng hàng. Dòng chưa
// có lô cũng là đơn đang giữ chỗ nên vẫn tính (hiện chỉ có 1 Kho thành phẩm thật nên không cần lọc theo kho).
async function loadDemand(
  roomId: string,
  warehouseId: string,
  todayKey: string,
  client: Client,
  opts: { plantTypeIds?: string[]; excludeOrderId?: string } = {}
): Promise<Pick<ForecastInput, "stock"> & { orders: (ForecastInput["orders"][number] & { orderId: string; orderCode: string; depositedAt: Date | null })[] }> {
  const { plantTypeIds, excludeOrderId } = opts;
  const [stock, orderItems] = await Promise.all([
    client.lot.findMany({
      where: { roomId, status: "ACTIVE", quantity: { gt: 0 }, ...(plantTypeIds ? { plantTypeId: { in: plantTypeIds } } : {}) },
      select: { plantTypeId: true, stageCode: true, quantity: true },
    }),
    client.orderItem.findMany({
      where: {
        order: { status: { in: ["HELD", "CONFIRMED"] }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
        ...(plantTypeIds ? { plantTypeId: { in: plantTypeIds } } : {}),
        // Dòng đã xử lý xong: tồn thực đã trừ thật, không trừ đôi — cùng điều kiện với getQualifiedLots.
        AND: [
          // Dòng chưa gắn lô chưa có phòng: tính theo kho làm việc của NV bán hàng, để đơn kho này không trừ tồn dự kiến kho khác.
          { OR: [{ lot: { roomId } }, { lotId: null, order: { sale: { OR: [{ workplaceWarehouseId: warehouseId }, { workplaceWarehouseId: null }] } } }] },
          { OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }] },
        ],
      },
      select: {
        quantity: true, plantTypeId: true, stageCode: true,
        lot: { select: { plantTypeId: true, stageCode: true } },
        order: { select: { id: true, code: true, status: true, expectedShipAt: true, confirmedAt: true } },
      },
    }),
  ]);
  return {
    stock,
    orders: orderItems.map((i) => ({
      plantTypeId: i.plantTypeId ?? i.lot?.plantTypeId ?? "",
      stageCode: i.stageCode ?? i.lot?.stageCode ?? "",
      quantity: i.quantity,
      // Đơn cũ không có ngày xuất: coi như xuất ngay để không đánh giá cao tồn.
      dateKey: i.order.expectedShipAt ? toVnDateKey(i.order.expectedShipAt) : todayKey,
      note: `${i.order.code} · ${i.order.status === "HELD" ? "Tạm giữ" : "Đã cọc"}`,
      orderId: i.order.id,
      orderCode: i.order.code,
      depositedAt: i.order.status === "CONFIRMED" ? i.order.confirmedAt ?? new Date(0) : null,
    })),
  };
}

export type FinishedForecastResult = {
  ratePct: number;
  roomFound: boolean;
  rows: (ForecastRow & { code: string; name: string })[];
  lateSupplierPlans: { code: string; supplierName: string; expectedKey: string; quantity: number }[];
  uploadedMonths: { month: string; quantity: number }[];
};

export async function computeFinishedForecast(warehouseId: string, dateKey: string, now: Date = new Date()): Promise<FinishedForecastResult> {
  await ensureExpiredOrdersCancelled();
  const uploaded = await getUploadedRegistered();
  const uploadedMonths = Object.entries(uploaded)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, rows]) => ({ month, quantity: Object.values(rows).reduce((s, q) => s + q, 0) }));

  const roomId = await getDatRoomId(warehouseId);
  if (!roomId) return { ratePct: await getForecastRatePct(), roomFound: false, rows: [], lateSupplierPlans: [], uploadedMonths };

  const supply = await loadSupply(roomId, warehouseId, now);
  const demand = await loadDemand(roomId, warehouseId, supply.todayKey, prisma);
  const rows = computeForecastRows({ ...supply, ...demand }, dateKey);
  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: rows.map((r) => r.plantTypeId) } },
    select: { id: true, code: true, name: true },
  });
  const plantById = new Map(plantTypes.map((p) => [p.id, p]));

  return {
    ratePct: supply.ratePct,
    roomFound: true,
    rows: rows
      .map((r) => ({ ...r, code: plantById.get(r.plantTypeId)?.code ?? "", name: plantById.get(r.plantTypeId)?.name ?? "" }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    lateSupplierPlans: supply.lateSupplierPlans,
    uploadedMonths,
  };
}

// Mốc N của 1 đơn: ngày xuất lùi 2 ngày làm việc.
export async function getShipCutoffKey(shipDate: Date, now: Date = new Date()): Promise<string> {
  const holidays = await prisma.publicHoliday.findMany({
    where: { date: { gte: new Date(shipDate.getTime() - 40 * 86_400_000), lte: shipDate } },
    select: { date: true },
  });
  return shipCutoffKey(toVnDateKey(shipDate), toVnDateKey(now), new Set(holidays.map((h) => toVnDateKey(h.date))));
}

export type DepositedShortfall = { orderId: string; orderCode: string; shipKey: string; lines: { code: string; stageCode: string; quantity: number }[] };

// Đơn đã cọc bị thiếu so với tồn dự kiến hiện tại (số đạt giảm, NCC trễ/giao thiếu) — hiện trên Tổng quan của QL Kho TP. Đơn
// cọc trước được ưu tiên: mỗi đơn chỉ tính cùng các đơn cọc trước nó; đơn tạm giữ không tranh với đơn đã cọc.
export async function getDepositedOrderShortfalls(warehouseId: string): Promise<DepositedShortfall[]> {
  const roomId = await getDatRoomId(warehouseId);
  if (!roomId) return [];
  const supply = await loadSupply(roomId, warehouseId, new Date());
  const demand = await loadDemand(roomId, warehouseId, supply.todayKey, prisma);
  const deposited = demand.orders
    .filter((o) => o.depositedAt)
    .sort((a, b) => a.depositedAt!.getTime() - b.depositedAt!.getTime() || a.orderId.localeCompare(b.orderId));
  if (deposited.length === 0) return [];

  const holidays = await prisma.publicHoliday.findMany({ where: { date: { gte: new Date() } }, select: { date: true } });
  const holidayKeys = new Set(holidays.map((h) => toVnDateKey(h.date)));
  const onlyPlant = <T extends { plantTypeId: string }>(rows: T[], plantTypeId: string) => rows.filter((r) => r.plantTypeId === plantTypeId);

  const byOrder = new Map<string, { orderId: string; orderCode: string; shipKey: string; short: Map<string, { plantTypeId: string; stageCode: string; quantity: number }> }>();
  for (const plantTypeId of new Set(deposited.map((o) => o.plantTypeId))) {
    const lines = onlyPlant(deposited, plantTypeId);
    const input: Omit<ForecastInput, "orders"> = {
      ...supply,
      stock: onlyPlant(demand.stock, plantTypeId),
      rootingLots: onlyPlant(supply.rootingLots, plantTypeId),
      registered: onlyPlant(supply.registered, plantTypeId),
      supplierPlans: onlyPlant(supply.supplierPlans, plantTypeId),
    };
    for (const orderId of new Set(lines.map((l) => l.orderId))) {
      const rank = lines.findIndex((l) => l.orderId === orderId);
      const lastIndex = lines.map((l) => l.orderId).lastIndexOf(orderId);
      const considered = lines.slice(0, lastIndex + 1);
      const own = lines.slice(rank, lastIndex + 1).filter((l) => l.orderId === orderId);
      const full: ForecastInput = { ...input, orders: considered };
      const events = buildForecastEvents(full);
      const cutoff = shipCutoffKey(own[0].dateKey, supply.todayKey, holidayKeys);
      for (const stageCode of new Set(own.map((l) => l.stageCode))) {
        const balance = lineBalance(full, events, plantTypeId, stageCode, cutoff).withRegistered;
        if (balance >= 0) continue;
        const quantity = own.filter((l) => l.stageCode === stageCode).reduce((s, l) => s + l.quantity, 0);
        const entry = byOrder.get(orderId) ?? { orderId, orderCode: own[0].orderCode, shipKey: own[0].dateKey, short: new Map() };
        entry.short.set(`${plantTypeId}:${stageCode}`, { plantTypeId, stageCode, quantity: Math.min(quantity, -balance) });
        byOrder.set(orderId, entry);
      }
    }
  }
  if (byOrder.size === 0) return [];

  const plantIds = [...byOrder.values()].flatMap((o) => [...o.short.values()].map((s) => s.plantTypeId));
  const plants = await prisma.plantType.findMany({ where: { id: { in: plantIds } }, select: { id: true, code: true } });
  const codeOf = new Map(plants.map((p) => [p.id, p.code]));
  return [...byOrder.values()]
    .map((o) => ({
      orderId: o.orderId, orderCode: o.orderCode, shipKey: o.shipKey,
      lines: [...o.short.values()].map((s) => ({ code: codeOf.get(s.plantTypeId) ?? "", stageCode: s.stageCode, quantity: s.quantity })),
    }))
    .sort((a, b) => a.shipKey.localeCompare(b.shipKey));
}

export type LineAvailability = { exact: number; withRegistered: number };

// Chuẩn bị tính số đáp ứng cho các mã cây của 1 đơn. Trả về hàm đọc tồn thực + đơn (truyền tx khi tạo đơn) rồi tính
// từng mã cây + quy cách. Kho chưa có Phòng đạt tiêu chuẩn thì số đáp ứng luôn 0.
export async function prepareAvailability(warehouseId: string | null, plantTypeIds: string[], shipDate: Date, opts: { excludeOrderId?: string } = {}) {
  const roomId = warehouseId ? await getDatRoomId(warehouseId) : null;
  const dateKey = await getShipCutoffKey(shipDate);
  const supply = roomId && warehouseId ? await loadSupply(roomId, warehouseId, new Date(), plantTypeIds) : null;

  return async (client: Client = prisma) => {
    if (!roomId || !supply || !warehouseId) return (): LineAvailability => ({ exact: 0, withRegistered: 0 });
    const demand = await loadDemand(roomId, warehouseId, supply.todayKey, client, { plantTypeIds, excludeOrderId: opts.excludeOrderId });
    const input: ForecastInput = { ...supply, ...demand };
    const events = buildForecastEvents(input);
    return (plantTypeId: string, stageCode: string): LineAvailability => lineAvailability(input, events, plantTypeId, stageCode, dateKey);
  };
}
