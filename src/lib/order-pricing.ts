import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEffectivePriceList, getEffectiveRates } from "@/lib/price-list";
import { dateToDateKey, vnDateKey } from "@/lib/price-list-shared";
import { priceKey, roundCur, type InvoiceInput, type InvoiceLine, type InvoiceManualLine } from "@/lib/invoice-engine";
import { findPriceRow, priceOrderLines, type OrderPriceList, type OrderPriceRow } from "@/lib/order-price-engine";

// Giá đơn hàng: lúc tạo đơn chốt bảng giá đang áp dụng (Order.priceListId) và ghi đơn giá từng dòng. Sửa đơn / thêm hàng
// NCC sau đó chỉ tính lại bậc số lượng TRÊN CHÍNH bảng đã chốt, bảng giá duyệt về sau không ảnh hưởng đơn này.
// Dòng không có giá (OrderItem.priceIssue) vẫn giữ hàng được, nhưng cần giá tay qua Phiếu báo giá + Admin cấp cao duyệt
// mới Xác nhận được đơn. Đơn Kho thị trường và thị trường tắt bảng giá không tính giá (Order.pricedAt null).

type Db = Prisma.TransactionClient | typeof prisma;

const toOrderPriceList = (list: {
  currency: string; tiers: string[];
  items: { code: string; name: string; spec: string; plantTypeId: string | null; stageCode: string | null; prices: unknown }[];
}): OrderPriceList => ({
  currency: list.currency,
  tiers: list.tiers,
  items: list.items.map((i): OrderPriceRow => ({
    code: i.code, name: i.name, spec: i.spec, plantTypeId: i.plantTypeId, stageCode: i.stageCode, prices: i.prices as (number | null)[],
  })),
});

// Bảng giá sẽ chốt cho đơn tạo NGAY LÚC NÀY. priced=false: thị trường không dùng bảng giá (đơn không tính giá).
export async function resolveOrderPriceList(marketId: string) {
  const market = await prisma.market.findUnique({ where: { id: marketId }, select: { priceListEnabled: true } });
  if (!market?.priceListEnabled) return { priced: false as const, id: null, effectiveFrom: null, list: null };
  const found = await getEffectivePriceList(marketId, vnDateKey());
  return {
    priced: true as const,
    id: found?.id ?? null,
    effectiveFrom: found ? dateToDateKey(found.effectiveFrom) : null,
    list: found ? toOrderPriceList(found) : null,
  };
}

const ITEM_FIELDS = {
  id: true, plantTypeId: true, stageCode: true, priceStageCode: true, quantity: true, neededQuantity: true,
  unitPrice: true, priceTier: true, priceIssue: true, priceManual: true,
  lot: { select: { plantTypeId: true, stageCode: true } },
} as const;

type ItemRow = Prisma.OrderItemGetPayload<{ select: typeof ITEM_FIELDS }>;

// Dòng dùng tra giá: số cây thật cần (neededQuantity, không tính phần dư túi) theo quy cách khách cần (priceStageCode).
const pricingLine = (i: ItemRow) => ({
  plantTypeId: i.plantTypeId ?? i.lot?.plantTypeId ?? "",
  stageCode: i.priceStageCode ?? i.stageCode ?? i.lot?.stageCode ?? "",
  quantity: i.neededQuantity ?? i.quantity,
});
export const orderLineKey = (l: { plantTypeId: string; stageCode: string }) => `${l.plantTypeId}:${l.stageCode}`;

// Tính lại giá mọi dòng của đơn trên bảng đã chốt. Dòng giá tay đã duyệt giữ nguyên giá (dòng mới cùng mã + quy cách theo
// giá tay đó). Trả về số dòng chưa có giá. Đơn không tính giá thì bỏ qua. `list` truyền sẵn để transaction Serializable
// lúc tạo đơn khỏi phải đọc bảng giá bên trong.
export async function repriceOrder(db: Db, orderId: string, prefetched?: { list: OrderPriceList | null }): Promise<number> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { pricedAt: true, priceListId: true, items: { select: ITEM_FIELDS } } });
  if (!order?.pricedAt) return 0;
  let list = prefetched?.list ?? null;
  if (!prefetched && order.priceListId) {
    const found = await db.priceList.findUnique({ where: { id: order.priceListId }, include: { items: true } });
    list = found ? toOrderPriceList(found) : null;
  }

  const lines = order.items.map(pricingLine);
  const prices = priceOrderLines(list, lines);
  const manualByKey = new Map<string, number>();
  order.items.forEach((item, i) => { if (item.priceManual && item.unitPrice != null) manualByKey.set(orderLineKey(lines[i]), item.unitPrice); });

  let issues = 0;
  for (const [i, item] of order.items.entries()) {
    const manual = manualByKey.get(orderLineKey(lines[i]));
    const next = manual != null
      ? { unitPrice: manual, priceTier: null, priceIssue: null, priceManual: true }
      : { unitPrice: prices[i].unitPrice, priceTier: prices[i].tier, priceIssue: prices[i].issue, priceManual: false };
    if (next.priceIssue) issues += 1;
    const same = item.unitPrice === next.unitPrice && item.priceTier === next.priceTier && item.priceIssue === next.priceIssue && item.priceManual === next.priceManual;
    if (!same) await db.orderItem.update({ where: { id: item.id }, data: next });
  }
  return issues;
}

// Dòng phiếu báo giá dựng từ đơn hàng đã tính giá: có dòng bảng giá thì thành dòng theo bảng (dưới tối thiểu / không có
// giá bậc thì Sale phải nhập giá tay), không có thì thành dòng nhập tay chờ nhập đơn giá.
export type OrderInvoicePrefill = { orderId: string; lines: InvoiceLine[]; manual: InvoiceManualLine[]; quantities: Record<string, number> };

const bagOfStage = (stageCode: string) => (stageCode === "T01" ? 1 : stageCode === "T05" ? 5 : 10);

export async function buildOrderInvoicePrefill(orderId: string): Promise<OrderInvoicePrefill | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      pricedAt: true, priceListId: true,
      items: { select: { ...ITEM_FIELDS, plantType: { select: { code: true, name: true } }, lot: { select: { plantTypeId: true, stageCode: true, plantType: { select: { code: true, name: true } } } } } },
    },
  });
  if (!order?.pricedAt) return null;
  const found = order.priceListId ? await prisma.priceList.findUnique({ where: { id: order.priceListId }, include: { items: true } }) : null;
  const rows = found ? toOrderPriceList(found).items : [];

  const groups = new Map<string, { plantTypeId: string; stageCode: string; code: string; name: string; quantity: number; manualPrice: number | null }>();
  for (const item of order.items) {
    const line = pricingLine(item);
    const plant = item.plantType ?? item.lot?.plantType;
    const key = orderLineKey(line);
    const prev = groups.get(key);
    groups.set(key, {
      plantTypeId: line.plantTypeId, stageCode: line.stageCode, code: plant?.code ?? "", name: plant?.name ?? "",
      quantity: (prev?.quantity ?? 0) + line.quantity,
      manualPrice: prev?.manualPrice ?? (item.priceManual ? item.unitPrice : null),
    });
  }

  const lines: InvoiceLine[] = [];
  const manual: InvoiceManualLine[] = [];
  const quantities: Record<string, number> = {};
  for (const [key, g] of groups) {
    quantities[key] = g.quantity;
    const row = findPriceRow(rows, g.plantTypeId, g.stageCode);
    if (row) lines.push({ key: priceKey(row), qty: g.quantity, bag: bagOfStage(g.stageCode), manualPrice: g.manualPrice, shipCat: "", shipRate: null, orderKey: key });
    else manual.push({ code: g.code, desc: g.name, spec: g.stageCode, qty: g.quantity, unit: g.manualPrice ?? 0, shipRate: null, orderKey: key });
  }
  return { orderId, lines, manual, quantities };
}

// Phiếu gắn đơn đã tính giá phải khớp số lượng từng mã + quy cách của đơn (được thêm dòng ngoài đơn, VD cành/cây rễ).
export function invoiceMatchesOrder(input: InvoiceInput, prefill: OrderInvoicePrefill): boolean {
  const got = new Map<string, number>();
  for (const l of [...input.lines, ...input.manual]) if (l.orderKey) got.set(l.orderKey, (got.get(l.orderKey) ?? 0) + (+l.qty || 0));
  const want = Object.entries(prefill.quantities);
  return got.size === want.length && want.every(([key, qty]) => got.get(key) === qty);
}

// Phiếu báo giá đã APPROVED: ghi giá tay đã duyệt xuống dòng đơn (đổi về đơn vị tiền bảng giá nếu phiếu lập bằng đơn vị
// tiền tự tạo), dòng không còn giá tay về lại giá bảng. Phiếu không có orderKey (đơn cũ) không làm gì.
export async function syncOrderPricesFromInvoice(invoiceId: string) {
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { orderId: true, currency: true, invoiceDate: true, input: true } });
  if (!inv?.orderId) return;
  const order = await prisma.order.findUnique({
    where: { id: inv.orderId },
    select: { pricedAt: true, priceList: { select: { currency: true } }, salesMarket: { select: { currency: true } }, items: { select: ITEM_FIELDS } },
  });
  if (!order?.pricedAt) return;
  const input = inv.input as unknown as InvoiceInput;
  const manualByKey = new Map<string, number>();
  for (const l of input.lines) if (l.orderKey && l.manualPrice != null && l.manualPrice > 0) manualByKey.set(l.orderKey, l.manualPrice);
  for (const m of input.manual) if (m.orderKey && m.unit > 0) manualByKey.set(m.orderKey, m.unit);

  const base = order.priceList?.currency ?? order.salesMarket?.currency ?? inv.currency;
  let fx = 1;
  if (base !== inv.currency && manualByKey.size > 0) {
    const rates = await getEffectiveRates(inv.invoiceDate.toISOString().slice(0, 7));
    const from = rates.get(inv.currency), to = rates.get(base);
    if (!from || !to) throw new Error(`Chưa có tỉ giá ${inv.currency}/${base} để ghi giá tay xuống đơn`);
    fx = from.vndPerUnit / to.vndPerUnit;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const manual = manualByKey.get(orderLineKey(pricingLine(item)));
      if (manual != null) await tx.orderItem.update({ where: { id: item.id }, data: { unitPrice: roundCur(manual * fx, base), priceTier: null, priceIssue: null, priceManual: true } });
      else if (item.priceManual) await tx.orderItem.update({ where: { id: item.id }, data: { priceManual: false } });
    }
    await repriceOrder(tx, inv.orderId!);
  });
}

// Huỷ phiếu đã duyệt: giá tay ghi từ phiếu đó không còn căn cứ, đơn về lại giá bảng.
export async function clearOrderManualPrices(orderId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.orderItem.updateMany({ where: { orderId, priceManual: true }, data: { priceManual: false } });
    await repriceOrder(tx, orderId);
  });
}
