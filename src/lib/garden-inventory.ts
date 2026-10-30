import type { GardenPool, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

// Nghiệp vụ 5 — tồn chi tiết 4 kho vườn (GardenStockLine) + phân bổ đơn hàng (GardenAllocation) + lịch sử
// (GardenMovementLog). Mọi hàm nhận tx: gọi trong 1 transaction để thao tác kết hợp nhiều bước được cập nhật
// đồng bộ — lỗi ở bất kỳ bước nào ném InventoryError, transaction rollback, không để dữ liệu dở dang.

export class InventoryError extends Error {}

export const GARDEN_POOL_LABELS: Record<GardenPool, string> = {
  CONTAMINATED: "Kho nhiễm",
  PLANNED: "Kho cây trồng",
  FINISHED: "Kho thành phẩm",
  LIQUIDATION: "Kho thanh lý",
};
// Kho được phân bổ cho đơn hàng Sale.
export const ALLOCATABLE_POOLS: GardenPool[] = ["FINISHED", "LIQUIDATION"];

const fmt = (n: number) => n.toLocaleString("vi-VN");

// Giữ chỗ còn hiệu lực theo dòng tồn = Σ (phân bổ − đã xuất − đã huỷ) của phân bổ ACTIVE.
export async function reservedByLine(client: Client, lineIds: string[]): Promise<Map<string, number>> {
  if (lineIds.length === 0) return new Map();
  const rows = await client.gardenAllocation.findMany({
    where: { lineId: { in: lineIds }, status: "ACTIVE" },
    select: { lineId: true, quantity: true, shippedQuantity: true, cancelledQuantity: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.lineId, (map.get(r.lineId) ?? 0) + r.quantity - r.shippedQuantity - r.cancelledQuantity);
  return map;
}

type LineKey = { gardenId: string; pool: GardenPool; lotId: string | null; plantTypeId: string; stageCode: string; rowId: string | null; staffId: string | null };

// Cộng q cây vào dòng tồn khớp đúng (kho, lô, mã cây, size, vị trí, NV) — chưa có thì tạo dòng mới.
export async function addToLine(tx: Tx, key: LineKey, quantity: number): Promise<string> {
  if (quantity <= 0) throw new InventoryError("Số lượng phải lớn hơn 0");
  const existing = await tx.gardenStockLine.findFirst({
    where: { gardenId: key.gardenId, pool: key.pool, lotId: key.lotId, plantTypeId: key.plantTypeId, stageCode: key.stageCode, rowId: key.rowId, staffId: key.staffId },
    select: { id: true },
  });
  if (existing) {
    await tx.gardenStockLine.update({ where: { id: existing.id }, data: { quantity: { increment: quantity } } });
    return existing.id;
  }
  const created = await tx.gardenStockLine.create({ data: { ...key, quantity }, select: { id: true } });
  return created.id;
}

// Trừ q cây khỏi 1 dòng tồn — mặc định chỉ được lấy phần KHẢ DỤNG (không đụng phần đang giữ chỗ cho đơn hàng).
// Xuất kho (allowReserved) được lấy cả phần giữ chỗ của chính phân bổ đó.
export async function takeFromLine(tx: Tx, lineId: string, quantity: number, opts: { allowReserved?: number } = {}) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new InventoryError("Số lượng phải lớn hơn 0");
  const line = await tx.gardenStockLine.findUnique({ where: { id: lineId }, select: { quantity: true } });
  if (!line) throw new InventoryError("Không tìm thấy dòng tồn");
  const reserved = (await reservedByLine(tx, [lineId])).get(lineId) ?? 0;
  const available = line.quantity - reserved + (opts.allowReserved ?? 0);
  if (quantity > available) throw new InventoryError(`Chỉ còn ${fmt(Math.max(0, available))} cây khả dụng (tồn ${fmt(line.quantity)}, giữ chỗ ${fmt(reserved)})`);
  const dec = await tx.gardenStockLine.updateMany({ where: { id: lineId, quantity: { gte: quantity } }, data: { quantity: { decrement: quantity } } });
  if (dec.count !== 1) throw new InventoryError("Tồn vừa thay đổi — tải lại trang");
}

// Dọn dòng tồn 0 không còn phân bổ nào trỏ tới (giữ dòng có lịch sử phân bổ để truy xuất).
export async function cleanupEmptyLines(tx: Tx, gardenId: string) {
  await tx.gardenStockLine.deleteMany({ where: { gardenId, quantity: { lte: 0 }, allocations: { none: {} }, careItems: { none: {} } } });
}

export type LogInput = {
  gardenId: string; type: string; lotCode?: string | null; plantTypeId: string; quantity: number;
  fromPool?: GardenPool | null; toPool?: GardenPool | null; fromStage?: string | null; toStage?: string | null;
  fromRow?: string | null; toRow?: string | null; fromStaff?: string | null; toStaff?: string | null;
  orderCode?: string | null; note?: string | null; byId: string;
};
export async function logMovement(tx: Tx, input: LogInput) {
  await tx.gardenMovementLog.create({ data: input });
}

async function rowLabelOf(tx: Tx, rowId: string | null) {
  if (!rowId) return null;
  const r = await tx.gardenRow.findUnique({ where: { id: rowId }, select: { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } });
  return r ? `${r.rack.house.number}${r.rack.letter}${r.number}` : null;
}
async function staffNameOf(tx: Tx, staffId: string | null) {
  if (!staffId) return null;
  return (await tx.gardenStaff.findUnique({ where: { id: staffId }, select: { name: true } }))?.name ?? null;
}

// Hướng A — điều phối 1 phần (hoặc toàn bộ) 1 dòng tồn: đổi kho / size / vị trí / NV phụ trách (bất kỳ tổ hợp).
// undefined = giữ nguyên; rowId/staffId null = bỏ vị trí / bỏ NV. Tổng số cây không đổi.
export async function moveStock(tx: Tx, params: {
  lineId: string; quantity: number; toPool?: GardenPool; toStage?: string; toRowId?: string | null; toStaffId?: string | null;
  type?: string; note?: string | null; byId: string;
}) {
  const line = await tx.gardenStockLine.findUnique({
    where: { id: params.lineId },
    select: { gardenId: true, pool: true, lotId: true, plantTypeId: true, stageCode: true, rowId: true, staffId: true, lot: { select: { code: true } } },
  });
  if (!line) throw new InventoryError("Không tìm thấy dòng tồn");
  const to: LineKey = {
    gardenId: line.gardenId, lotId: line.lotId, plantTypeId: line.plantTypeId,
    pool: params.toPool ?? line.pool,
    stageCode: params.toStage ?? line.stageCode,
    rowId: params.toRowId === undefined ? line.rowId : params.toRowId,
    staffId: params.toStaffId === undefined ? line.staffId : params.toStaffId,
  };
  if (to.pool === line.pool && to.stageCode === line.stageCode && to.rowId === line.rowId && to.staffId === line.staffId) {
    throw new InventoryError("Chưa có thay đổi nào (kho, size, vị trí, NV giữ nguyên)");
  }
  if (to.rowId) {
    const row = await tx.gardenRow.findFirst({ where: { id: to.rowId, rack: { house: { gardenId: line.gardenId } } }, select: { id: true } });
    if (!row) throw new InventoryError("Dãy không thuộc vườn này");
  }
  if (to.staffId) {
    const staff = await tx.gardenStaff.findFirst({ where: { id: to.staffId, gardenId: line.gardenId, isActive: true }, select: { id: true } });
    if (!staff) throw new InventoryError("Nhân viên không thuộc vườn này");
  }
  await takeFromLine(tx, params.lineId, params.quantity);
  await addToLine(tx, to, params.quantity);
  await logMovement(tx, {
    gardenId: line.gardenId, type: params.type ?? "MOVE", lotCode: line.lot?.code ?? null, plantTypeId: line.plantTypeId, quantity: params.quantity,
    fromPool: line.pool, toPool: to.pool, fromStage: line.stageCode, toStage: to.stageCode,
    fromRow: await rowLabelOf(tx, line.rowId), toRow: await rowLabelOf(tx, to.rowId),
    fromStaff: await staffNameOf(tx, line.staffId), toStaff: await staffNameOf(tx, to.staffId),
    note: params.note ?? null, byId: params.byId,
  });
}

// Trừ hẳn cây khỏi dòng tồn (cây hỏng) — kèm lịch sử.
export async function removeStock(tx: Tx, params: { lineId: string; quantity: number; type: string; note?: string | null; byId: string }) {
  const line = await tx.gardenStockLine.findUnique({
    where: { id: params.lineId },
    select: { gardenId: true, pool: true, plantTypeId: true, stageCode: true, rowId: true, staffId: true, lot: { select: { code: true } } },
  });
  if (!line) throw new InventoryError("Không tìm thấy dòng tồn");
  await takeFromLine(tx, params.lineId, params.quantity);
  await logMovement(tx, {
    gardenId: line.gardenId, type: params.type, lotCode: line.lot?.code ?? null, plantTypeId: line.plantTypeId, quantity: params.quantity,
    fromPool: line.pool, fromStage: line.stageCode, fromRow: await rowLabelOf(tx, line.rowId), fromStaff: await staffNameOf(tx, line.staffId),
    note: params.note ?? null, byId: params.byId,
  });
}

// Hướng B — phân bổ cho đơn hàng Sale (HELD/CONFIRMED) từ Kho thành phẩm/Kho thanh lý: chỉ giữ chỗ phần khả dụng.
export async function allocateToOrder(tx: Tx, params: { lineId: string; orderId: string; quantity: number; note?: string | null; byId: string }) {
  if (!Number.isInteger(params.quantity) || params.quantity <= 0) throw new InventoryError("Số lượng phân bổ phải lớn hơn 0");
  const line = await tx.gardenStockLine.findUnique({
    where: { id: params.lineId },
    select: { gardenId: true, pool: true, lotId: true, plantTypeId: true, stageCode: true, quantity: true, rowId: true, lot: { select: { code: true } } },
  });
  if (!line) throw new InventoryError("Không tìm thấy dòng tồn");
  if (!ALLOCATABLE_POOLS.includes(line.pool)) throw new InventoryError("Chỉ phân bổ được từ Kho thành phẩm hoặc Kho thanh lý");
  const order = await tx.order.findUnique({ where: { id: params.orderId }, select: { code: true, status: true } });
  if (!order) throw new InventoryError("Không tìm thấy đơn hàng");
  if (order.status !== "HELD" && order.status !== "CONFIRMED") throw new InventoryError(`Đơn ${order.code} không còn ở trạng thái giữ/đã xác nhận`);
  const reserved = (await reservedByLine(tx, [params.lineId])).get(params.lineId) ?? 0;
  if (params.quantity > line.quantity - reserved) {
    throw new InventoryError(`Chỉ còn ${fmt(Math.max(0, line.quantity - reserved))} cây khả dụng để phân bổ`);
  }
  const allocation = await tx.gardenAllocation.create({
    data: {
      gardenId: line.gardenId, orderId: params.orderId, lineId: params.lineId, lotId: line.lotId, plantTypeId: line.plantTypeId,
      stageCode: line.stageCode, pool: line.pool, quantity: params.quantity, notes: params.note ?? null, createdById: params.byId,
    },
    select: { id: true },
  });
  await logMovement(tx, {
    gardenId: line.gardenId, type: "ALLOCATE", lotCode: line.lot?.code ?? null, plantTypeId: line.plantTypeId, quantity: params.quantity,
    fromPool: line.pool, fromStage: line.stageCode, fromRow: await rowLabelOf(tx, line.rowId), orderCode: order.code, note: params.note ?? null, byId: params.byId,
  });
  return allocation.id;
}

// Xác nhận xuất kho (1 phần hoặc toàn bộ phần còn lại) — lúc này mới trừ tồn vật lý, mỗi cây xuất 1 lần.
export async function shipAllocation(tx: Tx, params: { allocationId: string; quantity: number; byId: string }) {
  const a = await tx.gardenAllocation.findUnique({
    where: { id: params.allocationId },
    select: { id: true, gardenId: true, lineId: true, status: true, quantity: true, shippedQuantity: true, cancelledQuantity: true, plantTypeId: true, pool: true, stageCode: true, lot: { select: { code: true } }, order: { select: { code: true } } },
  });
  if (!a || a.status !== "ACTIVE") throw new InventoryError("Phân bổ không còn chờ đóng gói");
  const remaining = a.quantity - a.shippedQuantity - a.cancelledQuantity;
  if (!Number.isInteger(params.quantity) || params.quantity <= 0 || params.quantity > remaining) throw new InventoryError(`Số xuất phải từ 1 đến ${fmt(remaining)}`);
  const locked = await tx.gardenAllocation.updateMany({
    where: { id: a.id, status: "ACTIVE", shippedQuantity: a.shippedQuantity, cancelledQuantity: a.cancelledQuantity },
    data: { shippedQuantity: { increment: params.quantity }, ...(params.quantity === remaining ? { status: "DONE" } : {}) },
  });
  if (locked.count !== 1) throw new InventoryError("Phân bổ vừa thay đổi — tải lại trang");
  // Lấy từ phần giữ chỗ của chính phân bổ này (đã cập nhật shipped trước nên giữ chỗ hiện tại đã giảm đúng số xuất).
  const dec = await tx.gardenStockLine.updateMany({ where: { id: a.lineId, quantity: { gte: params.quantity } }, data: { quantity: { decrement: params.quantity } } });
  if (dec.count !== 1) throw new InventoryError("Tồn vật lý không đủ để xuất — kiểm tra lại dòng tồn");
  await logMovement(tx, {
    gardenId: a.gardenId, type: "SHIP", lotCode: a.lot?.code ?? null, plantTypeId: a.plantTypeId, quantity: params.quantity,
    fromPool: a.pool, fromStage: a.stageCode, orderCode: a.order.code, byId: params.byId,
  });
}

// Huỷ phần CHƯA XUẤT của 1 phân bổ — giải phóng về đúng dòng tồn nguồn (tồn vật lý không đổi).
export async function cancelAllocation(tx: Tx, params: { allocationId: string; byId: string; reason?: string | null }) {
  const a = await tx.gardenAllocation.findUnique({
    where: { id: params.allocationId },
    select: { id: true, gardenId: true, status: true, quantity: true, shippedQuantity: true, cancelledQuantity: true, plantTypeId: true, pool: true, stageCode: true, lot: { select: { code: true } }, order: { select: { code: true } } },
  });
  if (!a || a.status !== "ACTIVE") return 0;
  const release = a.quantity - a.shippedQuantity - a.cancelledQuantity;
  const locked = await tx.gardenAllocation.updateMany({
    where: { id: a.id, status: "ACTIVE", shippedQuantity: a.shippedQuantity, cancelledQuantity: a.cancelledQuantity },
    data: { cancelledQuantity: { increment: release }, status: a.shippedQuantity > 0 ? "DONE" : "CANCELLED" },
  });
  if (locked.count !== 1) throw new InventoryError("Phân bổ vừa thay đổi — tải lại trang");
  await logMovement(tx, {
    gardenId: a.gardenId, type: "CANCEL_ALLOCATION", lotCode: a.lot?.code ?? null, plantTypeId: a.plantTypeId, quantity: release,
    toPool: a.pool, toStage: a.stageCode, orderCode: a.order.code, note: params.reason ?? null, byId: params.byId,
  });
  return release;
}

// Đơn hàng Sale bị huỷ (huỷ tay hoặc tự huỷ khi quá hạn giữ) → tự huỷ phần chưa xuất của mọi phân bổ vườn của
// đơn, báo Quản lý vườn dừng đóng gói. Gọi SAU khi đơn đã chuyển CANCELLED; lỗi không chặn việc huỷ đơn.
export async function releaseGardenAllocationsForOrders(orderIds: string[], byId: string) {
  if (orderIds.length === 0) return;
  const allocations = await prisma.gardenAllocation.findMany({
    where: { orderId: { in: orderIds }, status: "ACTIVE" },
    select: { id: true, garden: { select: { managerId: true } }, order: { select: { code: true } }, plantType: { select: { code: true } }, stageCode: true },
  });
  for (const a of allocations) {
    try {
      const released = await prisma.$transaction((tx) => cancelAllocation(tx, { allocationId: a.id, byId, reason: `Đơn ${a.order.code} đã huỷ — tự giải phóng` }));
      if (released > 0 && a.garden.managerId) {
        await createAlert({
          type: "GARDEN_ALLOCATION_CANCELLED", title: "Đơn hàng huỷ — dừng đóng gói",
          message: `Đơn ${a.order.code} đã huỷ: giải phóng ${fmt(released)} cây ${a.plantType.code} (${a.stageCode}) về kho nguồn — dừng đóng gói số này.`,
          userId: a.garden.managerId, relatedId: a.id, relatedType: "GardenAllocation",
        });
      }
    } catch (err) {
      console.error("[garden-allocation] Không giải phóng được phân bổ", a.id, err);
    }
  }
}
