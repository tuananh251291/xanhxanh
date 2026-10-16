import type { OrchidOrderStatus, Prisma } from "@prisma/client";
import {
  OrchidError,
  allocateOrchidFifo,
  assertOrchidAvailable,
  getOrchidCustomerDebt,
  addDays,
} from "@/lib/orchid/server";
import { computeOrderTotals, resolveOrchidPrice, ORCHID_ORDER_STATUS_LABELS } from "@/lib/orchid/labels";

type Tx = Prisma.TransactionClient;

// Đơn giá theo bảng giá: giá riêng của khách > mốc số lượng.
export async function priceOrchidLines(
  tx: Tx,
  customerId: string,
  lines: { productId: string; quantity: number; unitPrice?: number }[]
): Promise<{ productId: string; quantity: number; unitPrice: number }[]> {
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const [products, customerPrices] = await Promise.all([
    tx.orchidProduct.findMany({ where: { id: { in: productIds } }, include: { priceTiers: true } }),
    tx.orchidCustomerPrice.findMany({ where: { customerId, productId: { in: productIds } } }),
  ]);
  return lines.map((l) => {
    const product = products.find((p) => p.id === l.productId);
    if (!product) throw new OrchidError("Sản phẩm không tồn tại");
    const unitPrice = l.unitPrice ?? resolveOrchidPrice(product.priceTiers, l.quantity, customerPrices.find((c) => c.productId === l.productId)?.price);
    return { productId: l.productId, quantity: l.quantity, unitPrice };
  });
}

// Ghi đè toàn bộ dòng hàng + tính lại tiền. requestedQuantity giữ nguyên số khách đặt ban đầu (theo sản phẩm).
export async function replaceOrchidOrderItems(
  tx: Tx,
  orderId: string,
  lines: { productId: string; quantity: number; unitPrice: number }[],
  vatRate: number,
  isNewOrder = false
) {
  const old = isNewOrder ? [] : await tx.orchidOrderItem.findMany({ where: { orderId }, select: { productId: true, requestedQuantity: true } });
  await tx.orchidOrderItem.deleteMany({ where: { orderId } });
  await tx.orchidOrderItem.createMany({
    data: lines.map((l) => ({
      orderId,
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      amount: Math.round(l.quantity * l.unitPrice),
      requestedQuantity: isNewOrder ? l.quantity : (old.find((o) => o.productId === l.productId)?.requestedQuantity ?? 0),
    })),
  });
  const totals = computeOrderTotals(lines, vatRate);
  await tx.orchidOrder.update({ where: { id: orderId }, data: { ...totals, vatRate } });
  return totals;
}

function assertStatus(current: OrchidOrderStatus, allowed: OrchidOrderStatus[], action: string) {
  if (!allowed.includes(current)) {
    throw new OrchidError(`Đơn đang ở trạng thái "${ORCHID_ORDER_STATUS_LABELS[current]}", không thể ${action}`);
  }
}

// Chốt đơn → CONFIRMED: kiểm tra đủ tồn khả dụng + hạn mức công nợ (Admin hoa lan được bỏ qua hạn mức).
export async function confirmOrchidOrder(tx: Tx, orderId: string, opts: { allowedFrom: OrchidOrderStatus[]; bypassCreditLimit?: boolean }) {
  const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, customer: true } });
  assertStatus(order.status, opts.allowedFrom, "xác nhận");
  await assertOrchidAvailable(tx, order.items, order.id);

  if (order.customer.creditLimit != null && !opts.bypassCreditLimit) {
    const { summary } = await getOrchidCustomerDebt(tx, order.customerId);
    const openOrders = await tx.orchidOrder.aggregate({
      where: { customerId: order.customerId, status: { in: ["CONFIRMED", "PREPARING"] }, id: { not: order.id } },
      _sum: { total: true },
    });
    const exposure = summary.outstanding + (openOrders._sum.total ?? 0) + order.total;
    if (exposure > order.customer.creditLimit) {
      throw new OrchidError(
        `Vượt hạn mức công nợ của khách (${Math.round(exposure).toLocaleString("vi-VN")} đ > ${order.customer.creditLimit.toLocaleString("vi-VN")} đ)`
      );
    }
  }
  await tx.orchidOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
}

// CONFIRMED → PREPARING: xuất lô FIFO (phiếu xuất), trừ tồn thực.
export async function prepareOrchidOrder(tx: Tx, orderId: string) {
  const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  assertStatus(order.status, ["CONFIRMED"], "xuất kho");
  for (const item of order.items) {
    const allocations = await allocateOrchidFifo(tx, item.productId, item.quantity);
    await tx.orchidOrderAllocation.createMany({ data: allocations.map((a) => ({ orderItemId: item.id, lotId: a.lotId, quantity: a.quantity })) });
  }
  await tx.orchidOrder.update({ where: { id: orderId }, data: { status: "PREPARING", preparedAt: new Date() } });
}

export async function shipOrchidOrder(tx: Tx, orderId: string) {
  const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id: orderId }, include: { customer: true } });
  assertStatus(order.status, ["PREPARING"], "giao hàng");
  const shippedAt = new Date();
  await tx.orchidOrder.update({
    where: { id: orderId },
    data: {
      status: "SHIPPED",
      shippedAt,
      dueDate: addDays(shippedAt, order.customer.paymentTermDays),
      ...(order.needInvoice && order.invoiceStatus === "NOT_ISSUED" ? { invoiceStatus: "PENDING" as const } : {}),
    },
  });
}

export async function completeOrchidOrder(tx: Tx, orderId: string) {
  const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id: orderId } });
  assertStatus(order.status, ["SHIPPED"], "hoàn thành");
  await tx.orchidOrder.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: new Date() } });
}

// Huỷ đơn chưa giao — đơn đã xuất lô (PREPARING) thì hoàn lại đúng lô đã trừ.
export async function cancelOrchidOrder(tx: Tx, orderId: string, reason: string | null, allowedFrom: OrchidOrderStatus[]) {
  const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { allocations: true } } } });
  assertStatus(order.status, allowedFrom, "huỷ");
  if (order.status === "PREPARING") {
    for (const item of order.items) {
      for (const a of item.allocations) {
        await tx.orchidLot.update({ where: { id: a.lotId }, data: { quantityRemaining: { increment: a.quantity - a.returnedQuantity } } });
      }
      await tx.orchidOrderAllocation.deleteMany({ where: { orderItemId: item.id } });
    }
  }
  await tx.orchidOrder.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
}

// Khách trả hàng (sau khi giao) — hoàn tồn về đúng các lô đã xuất, giảm công nợ theo giá trị trả (gồm VAT).
export async function returnOrchidOrder(tx: Tx, orderId: string, returns: { itemId: string; quantity: number }[]) {
  const order = await tx.orchidOrder.findUniqueOrThrow({ where: { id: orderId }, include: { items: { include: { allocations: { orderBy: { createdAt: "asc" } } } } } });
  assertStatus(order.status, ["SHIPPED", "COMPLETED", "PARTIALLY_RETURNED"], "nhận trả hàng");
  let returnedValue = 0;
  for (const r of returns) {
    if (r.quantity <= 0) continue;
    const item = order.items.find((i) => i.id === r.itemId);
    if (!item) throw new OrchidError("Dòng hàng không thuộc đơn này");
    if (r.quantity > item.quantity - item.returnedQuantity) throw new OrchidError(`Số lượng trả vượt số đã giao còn lại (${item.quantity - item.returnedQuantity})`);
    let left = r.quantity;
    for (const a of item.allocations) {
      if (left <= 0) break;
      const back = Math.min(left, a.quantity - a.returnedQuantity);
      if (back <= 0) continue;
      await tx.orchidOrderAllocation.update({ where: { id: a.id }, data: { returnedQuantity: { increment: back } } });
      await tx.orchidLot.update({ where: { id: a.lotId }, data: { quantityRemaining: { increment: back } } });
      left -= back;
    }
    await tx.orchidOrderItem.update({ where: { id: item.id }, data: { returnedQuantity: { increment: r.quantity } } });
    returnedValue += r.quantity * item.unitPrice;
  }
  if (returnedValue <= 0) throw new OrchidError("Nhập số lượng trả");
  const returnedAmount = order.returnedAmount + Math.round(returnedValue * (1 + order.vatRate / 100));
  const items = await tx.orchidOrderItem.findMany({ where: { orderId }, select: { quantity: true, returnedQuantity: true } });
  const allReturned = items.every((i) => i.returnedQuantity >= i.quantity);
  await tx.orchidOrder.update({
    where: { id: orderId },
    data: { returnedAmount, returnedAt: new Date(), status: allReturned ? "RETURNED" : "PARTIALLY_RETURNED" },
  });
}
