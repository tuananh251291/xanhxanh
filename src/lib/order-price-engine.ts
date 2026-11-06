import { lookupPrice, roundCur } from "@/lib/invoice-engine";
import { orderItemSpec } from "@/lib/order-item-spec";
import { dateToDateKey, mapPriceCode } from "@/lib/price-list-shared";

// Tra giá dòng đơn hàng theo bảng giá đã chốt — phần tính thuần, dùng chung client/server, KHÔNG import Prisma.
// Phần đọc/ghi DB ở src/lib/order-pricing.ts.

export type OrderPriceIssue = "NO_PRICE_LIST" | "NOT_IN_PRICE_LIST" | "BELOW_MOQ" | "NO_PRICE_AT_TIER";

export const ORDER_PRICE_ISSUE_LABELS: Record<OrderPriceIssue, string> = {
  NO_PRICE_LIST: "Chưa có bảng giá đã duyệt",
  NOT_IN_PRICE_LIST: "Không có trong bảng giá",
  BELOW_MOQ: "Dưới số lượng tối thiểu",
  NO_PRICE_AT_TIER: "Bảng giá trống ở bậc này",
};

export type OrderPriceRow = { code: string; name: string; spec: string; plantTypeId: string | null; stageCode: string | null; prices: (number | null)[] };
export type OrderPriceList = { currency: string; tiers: string[]; items: OrderPriceRow[] };
export type OrderPriceLineInput = { plantTypeId: string; stageCode: string; quantity: number };
export type OrderPriceLineResult = { row: OrderPriceRow | null; unitPrice: number | null; tier: string | null; issue: OrderPriceIssue | null };

// Dòng bảng giá của 1 mã cây + quy cách, cùng thứ tự Phiếu báo giá đang tính:
// 1. Đúng quy cách. 2. Dòng "Tissue culture" (quy cách null) = mọi loại túi. 3. Thị trường Đông Nam Á chỉ niêm yết
// theo túi: lấy dòng túi có sẵn (ưu tiên túi 10) — phụ thu túi 1 cây tính riêng ở Phiếu báo giá (computeInvoice).
// Dòng có quy cách chưa quy đổi được (stageMapped=false) không bao giờ được dùng.
export function findPriceRow(rows: OrderPriceRow[], plantTypeId: string, stageCode: string): OrderPriceRow | null {
  const mine = rows.filter((r) => r.plantTypeId === plantTypeId && mapPriceCode(r.code, r.spec).stageMapped);
  const exact = mine.find((r) => r.stageCode === stageCode);
  if (exact) return exact;
  const anyBag = mine.find((r) => r.stageCode === null);
  if (anyBag) return anyBag;
  if (!/^T\d{2}$/.test(stageCode)) return null;
  const bagRows = mine.filter((r) => r.stageCode && /^T\d{2}$/.test(r.stageCode));
  return bagRows.find((r) => r.stageCode === "T10") ?? bagRows[0] ?? null;
}

// Bậc số lượng tính trên TỔNG số cây của cả đơn cùng 1 dòng bảng giá (giống Phiếu báo giá), không theo từng dòng đơn.
export function priceOrderLines(list: OrderPriceList | null, lines: OrderPriceLineInput[]): OrderPriceLineResult[] {
  if (!list) return lines.map(() => ({ row: null, unitPrice: null, tier: null, issue: "NO_PRICE_LIST" }));
  const rowOf = lines.map((l) => findPriceRow(list.items, l.plantTypeId, l.stageCode));
  const totalByRow = new Map<OrderPriceRow, number>();
  lines.forEach((l, i) => {
    const row = rowOf[i];
    if (row) totalByRow.set(row, (totalByRow.get(row) ?? 0) + l.quantity);
  });
  return lines.map((_, i) => {
    const row = rowOf[i];
    if (!row) return { row: null, unitPrice: null, tier: null, issue: "NOT_IN_PRICE_LIST" };
    const hit = lookupPrice(list.tiers, row.prices, totalByRow.get(row) ?? 0);
    if (hit.err === "moq") return { row, unitPrice: null, tier: null, issue: "BELOW_MOQ" };
    if (hit.err === "notier") return { row, unitPrice: null, tier: hit.tier, issue: "NO_PRICE_AT_TIER" };
    return { row, unitPrice: roundCur(hit.price, list.currency), tier: hit.tier, issue: null };
  });
}

// Bảng hiển thị giá (xem trước lúc tạo đơn, chi tiết đơn): gộp theo mã cây + quy cách tra giá.
export type OrderPriceSummaryLine = {
  plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number;
  unitPrice: number | null; tier: string | null; issue: OrderPriceIssue | null; manual: boolean; amount: number | null;
};
export type OrderPriceSummary = { currency: string | null; effectiveFrom: string | null; lines: OrderPriceSummaryLine[]; total: number; issueCount: number };

export function summarizeOrderPrices(
  head: { currency: string | null; effectiveFrom: string | null },
  items: Omit<OrderPriceSummaryLine, "amount">[]
): OrderPriceSummary {
  const merged = new Map<string, Omit<OrderPriceSummaryLine, "amount">>();
  for (const it of items) {
    const key = `${it.plantTypeCode}:${it.stageCode}`;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, quantity: prev.quantity + it.quantity } : { ...it });
  }
  const cur = head.currency ?? "USD";
  const lines = [...merged.values()].map((l) => ({ ...l, amount: l.unitPrice == null ? null : roundCur(l.unitPrice * l.quantity, cur) }));
  return {
    ...head, lines,
    total: roundCur(lines.reduce((s, l) => s + (l.amount ?? 0), 0), cur),
    issueCount: lines.filter((l) => l.issue).length,
  };
}

// Ai thấy giá trên đơn: NV bán hàng + người lập phiếu hộ + Admin. NV kho đóng gói không cần giá bán.
export const canViewOrderPrice = (role: string | null | undefined) =>
  role === "SALE" || role === "QUAN_LY_KHO_THANH_PHAM" || role === "SUPER_ADMIN" || role === "ADMIN";

// Trường cần đọc để hiện giá của đơn đã lưu (buildOrderPriceSummary).
export const ORDER_PRICE_ORDER_FIELDS = { pricedAt: true, priceList: { select: { currency: true, effectiveFrom: true } } } as const;
export const ORDER_PRICE_ITEM_FIELDS = { neededQuantity: true, unitPrice: true, priceTier: true, priceIssue: true, priceManual: true, priceStageCode: true } as const;

type PlantRef = { code: string; name: string };
export type OrderPriceOrderSource = {
  pricedAt: Date | null;
  priceList: { currency: string; effectiveFrom: Date } | null;
  items: {
    quantity: number; neededQuantity: number | null; unitPrice: number | null; priceTier: string | null; priceIssue: OrderPriceIssue | null;
    priceManual: boolean; priceStageCode: string | null; plantTypeId: string | null; stageCode: string | null; plantType: PlantRef | null;
    lot: { plantTypeId: string; stageCode: string; plantType: PlantRef } | null;
  }[];
};

export function buildOrderPriceSummary(order: OrderPriceOrderSource): OrderPriceSummary | null {
  if (!order.pricedAt) return null;
  return summarizeOrderPrices(
    { currency: order.priceList?.currency ?? null, effectiveFrom: order.priceList ? dateToDateKey(order.priceList.effectiveFrom) : null },
    order.items.map((i) => {
      const spec = orderItemSpec(i);
      return {
        plantTypeCode: spec.plantType.code, plantTypeName: spec.plantType.name, stageCode: i.priceStageCode ?? spec.stageCode,
        quantity: i.neededQuantity ?? i.quantity, unitPrice: i.unitPrice, tier: i.priceTier, issue: i.priceIssue, manual: i.priceManual,
      };
    })
  );
}
