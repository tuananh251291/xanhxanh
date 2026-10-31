import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { allocateToOrder, cancelAllocation, InventoryError, logMovement } from "@/lib/garden-inventory";

type Tx = Prisma.TransactionClient;
const fmt = (n: number) => n.toLocaleString("vi-VN");

// Nghiệp vụ 7 — Đóng gói đơn hàng (GardenPackRequest). NV Điều phối lập phiếu giao vườn (đơn Sale → vườn → các dòng
// mã cây/size/số lượng), QLV phân bổ từ Kho thành phẩm/Kho thanh lý theo từng dòng (GardenAllocation.packItemId),
// giao NV đóng gói, ghi nhận số đã đóng gói, xác nhận xuất kho (shipAllocation — chỉ tối đa phần đã đóng gói, lúc
// này mới trừ tồn vật lý). Xuất đủ mọi dòng → phiếu DONE.

// Người lập/huỷ phiếu giao vườn: NV Điều phối + Admin cấp cao.
export const canDispatchPack = (role: string | null | undefined) => role === "DIEU_PHOI" || role === "SUPER_ADMIN";

// Số đã phân bổ hiệu lực của 1 dòng phiếu = Σ (phân bổ − đã huỷ) — gồm cả phần đã xuất.
export function allocatedOf(allocations: { quantity: number; cancelledQuantity: number }[]) {
  return allocations.reduce((s, a) => s + a.quantity - a.cancelledQuantity, 0);
}

// QLV phân bổ q cây từ 1 dòng tồn cho 1 dòng phiếu giao vườn — đúng mã cây + size của dòng phiếu, kho nguồn Kho
// thành phẩm/Kho thanh lý, chỉ phần khả dụng, tổng phân bổ không vượt số NV Điều phối giao.
export async function allocateForPackItem(tx: Tx, params: { itemId: string; lineId: string; quantity: number; byId: string }) {
  const item = await tx.gardenPackRequestItem.findUnique({
    where: { id: params.itemId },
    select: {
      id: true, plantTypeId: true, stageCode: true, quantity: true,
      request: { select: { id: true, code: true, status: true, gardenId: true, orderId: true } },
      allocations: { select: { quantity: true, cancelledQuantity: true } },
    },
  });
  if (!item) throw new InventoryError("Không tìm thấy dòng phiếu giao vườn");
  if (item.request.status !== "SENT") throw new InventoryError(`Phiếu ${item.request.code} không còn chờ đóng gói`);
  const line = await tx.gardenStockLine.findUnique({ where: { id: params.lineId }, select: { gardenId: true, plantTypeId: true, stageCode: true } });
  if (!line || line.gardenId !== item.request.gardenId) throw new InventoryError("Dòng tồn không thuộc vườn của phiếu");
  if (line.plantTypeId !== item.plantTypeId || line.stageCode !== item.stageCode) throw new InventoryError("Dòng tồn phải đúng mã cây và size của dòng phiếu");
  const left = item.quantity - allocatedOf(item.allocations);
  if (params.quantity > left) throw new InventoryError(`Dòng phiếu chỉ còn ${fmt(Math.max(0, left))} cây cần phân bổ`);
  const allocationId = await allocateToOrder(tx, { lineId: params.lineId, orderId: item.request.orderId, quantity: params.quantity, note: `Phiếu giao vườn ${item.request.code}`, byId: params.byId });
  await tx.gardenAllocation.update({ where: { id: allocationId }, data: { packItemId: item.id } });
  return allocationId;
}

// QLV ghi nhận tổng số đã đóng gói của 1 phân bổ (ghi đè): đã xuất ≤ số mới ≤ phân bổ − đã huỷ.
export async function recordPacked(tx: Tx, params: { allocationId: string; packedQuantity: number; byId: string }) {
  const a = await tx.gardenAllocation.findUnique({
    where: { id: params.allocationId },
    select: {
      id: true, gardenId: true, status: true, quantity: true, packedQuantity: true, shippedQuantity: true, cancelledQuantity: true, packItemId: true,
      plantTypeId: true, pool: true, stageCode: true, lot: { select: { code: true } }, order: { select: { code: true } },
      packItem: { select: { request: { select: { packer: { select: { name: true } } } } } },
    },
  });
  if (!a || a.status !== "ACTIVE") throw new InventoryError("Phân bổ không còn chờ đóng gói");
  if (!a.packItemId) throw new InventoryError("Phân bổ trực tiếp (không qua phiếu giao vườn) không cần ghi nhận đóng gói");
  const max = a.quantity - a.cancelledQuantity;
  const n = params.packedQuantity;
  if (!Number.isInteger(n) || n < a.shippedQuantity || n > max) throw new InventoryError(`Số đã đóng gói phải từ ${fmt(a.shippedQuantity)} (đã xuất) đến ${fmt(max)} (đã phân bổ)`);
  if (n === a.packedQuantity) throw new InventoryError("Số đã đóng gói không đổi");
  const locked = await tx.gardenAllocation.updateMany({
    where: { id: a.id, status: "ACTIVE", packedQuantity: a.packedQuantity, shippedQuantity: a.shippedQuantity, cancelledQuantity: a.cancelledQuantity },
    data: { packedQuantity: n },
  });
  if (locked.count !== 1) throw new InventoryError("Phân bổ vừa thay đổi — tải lại trang");
  await logMovement(tx, {
    gardenId: a.gardenId, type: "PACK", lotCode: a.lot?.code ?? null, plantTypeId: a.plantTypeId, quantity: n,
    fromPool: a.pool, fromStage: a.stageCode, orderCode: a.order.code,
    note: `Đã đóng gói ${fmt(a.packedQuantity)} → ${fmt(n)}${a.packItem?.request.packer ? ` · NV đóng gói ${a.packItem.request.packer.name}` : ""}`,
    byId: params.byId,
  });
}

// Sau mỗi lần xuất kho: phiếu có mọi dòng đã xuất đủ số NV Điều phối giao → DONE, báo NV Điều phối + NV bán hàng.
export async function completePackRequestIfDone(tx: Tx, allocationId: string) {
  const a = await tx.gardenAllocation.findUnique({ where: { id: allocationId }, select: { packItem: { select: { requestId: true } } } });
  if (!a?.packItem) return null;
  const req = await tx.gardenPackRequest.findUnique({
    where: { id: a.packItem.requestId },
    select: {
      id: true, code: true, status: true, createdById: true, garden: { select: { name: true } }, order: { select: { code: true, saleId: true } },
      items: { select: { quantity: true, allocations: { select: { shippedQuantity: true } } } },
    },
  });
  if (!req || req.status !== "SENT") return null;
  const done = req.items.every((it) => it.allocations.reduce((s, x) => s + x.shippedQuantity, 0) >= it.quantity);
  if (!done) return null;
  const locked = await tx.gardenPackRequest.updateMany({ where: { id: req.id, status: "SENT" }, data: { status: "DONE", doneAt: new Date() } });
  if (locked.count !== 1) return null;
  return req;
}

export async function notifyPackRequestDone(req: NonNullable<Awaited<ReturnType<typeof completePackRequestIfDone>>>) {
  const recipients = [...new Set([req.createdById, req.order.saleId])];
  await Promise.all(recipients.map((userId) => createAlert({
    type: "GARDEN_PACK_REQUEST_DONE",
    title: `${req.garden.name} đã xuất đủ phiếu ${req.code}`,
    message: `Đơn ${req.order.code}: ${req.garden.name} đã đóng gói và xác nhận xuất kho đủ số lượng phiếu giao vườn ${req.code}.`,
    userId, relatedId: req.id, relatedType: "GardenPackRequest",
  })));
}

// Huỷ phiếu giao vườn (NV Điều phối) — giải phóng phần chưa xuất của mọi phân bổ thuộc phiếu về kho nguồn (phần đã
// xuất giữ nguyên), báo QLV dừng đóng gói.
export async function cancelPackRequest(params: { requestId: string; byId: string; reason: string | null }) {
  const req = await prisma.gardenPackRequest.findUnique({
    where: { id: params.requestId },
    select: { id: true, code: true, status: true, garden: { select: { managerId: true } }, order: { select: { code: true } } },
  });
  if (!req) throw new InventoryError("Không tìm thấy phiếu giao vườn");
  if (req.status !== "SENT") throw new InventoryError(`Phiếu ${req.code} không còn chờ đóng gói`);
  const released = await prisma.$transaction(async (tx) => {
    const locked = await tx.gardenPackRequest.updateMany({
      where: { id: req.id, status: "SENT" },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: params.byId, cancelReason: params.reason },
    });
    if (locked.count !== 1) throw new InventoryError("Phiếu vừa thay đổi — tải lại trang");
    const allocations = await tx.gardenAllocation.findMany({ where: { packItem: { requestId: req.id }, status: "ACTIVE" }, select: { id: true } });
    let total = 0;
    for (const a of allocations) total += await cancelAllocation(tx, { allocationId: a.id, byId: params.byId, reason: `Huỷ phiếu giao vườn ${req.code}` });
    return total;
  }, { timeout: 30000 });
  if (req.garden.managerId) {
    await createAlert({
      type: "GARDEN_PACK_REQUEST_CANCELLED", title: `Phiếu giao vườn ${req.code} đã huỷ — dừng đóng gói`,
      message: `Đơn ${req.order.code}: NV Điều phối huỷ phiếu ${req.code}${params.reason ? ` (${params.reason})` : ""}.${released > 0 ? ` Đã giải phóng ${fmt(released)} cây chưa xuất về kho nguồn.` : ""}`,
      userId: req.garden.managerId, relatedId: req.id, relatedType: "GardenPackRequest",
    });
  }
  return released;
}
