// Invoice — phần server (Prisma). Bộ tính dùng chung client/server: src/lib/invoice-engine.ts.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getEffectivePriceList, getEffectiveRates } from "@/lib/price-list";
import { dateToMonthKey } from "@/lib/price-list-shared";
import {
  blankInvoiceInput, mergeInvoiceSettings, US_STATES, AU_STATES, SHIP_CATS,
  type InvoiceContext, type InvoiceInput, type InvoiceSettings, type ShipCat,
} from "@/lib/invoice-engine";

export const INVOICE_SETTINGS_KEY = "invoice_settings";
// Đơn bán cho khách tạo từ mốc này phải có invoice APPROVED gắn đơn mới Xác nhận được (đơn cũ giữ luồng cũ).
export const INVOICE_REQUIRED_FROM = new Date("2026-10-22T00:00:00+07:00");
// Tạm thời (yêu cầu 24/10/2026, 1 tuần): Quản lý kho TP tạo + xác nhận đơn hộ Sale thì KHÔNG cần invoice
// đã duyệt — đơn chuyển thẳng sang Sắp xếp đơn hàng. Hết mốc này tự áp dụng lại yêu cầu invoice.
export const QLK_INVOICE_EXEMPT_UNTIL = new Date("2026-11-01T00:00:00+07:00");
export const isInvoiceExemptForConfirm = (role: string | null | undefined, now: Date = new Date()) =>
  role === "QUAN_LY_KHO_THANH_PHAM" && now < QLK_INVOICE_EXEMPT_UNTIL;

// Lập invoice: NV bán hàng + Quản lý kho TP (lập hộ như tạo đơn hộ) + Admin cấp cao. Duyệt giá nhập tay: Admin cấp cao.
export const canCreateInvoice = (role: string | null | undefined) => role === "SALE" || role === "QUAN_LY_KHO_THANH_PHAM" || role === "SUPER_ADMIN";
export const canApproveInvoice = (role: string | null | undefined) => role === "SUPER_ADMIN";
export const canViewAllInvoices = (role: string | null | undefined) => role === "SUPER_ADMIN" || role === "ADMIN" || role === "QUAN_LY_KHO_THANH_PHAM";
export const canEditInvoiceSettings = (role: string | null | undefined) => role === "SUPER_ADMIN";

// Lịch chuyến Mỹ: Admin cấp cao hoặc NV Quản lý (managerId trong SalesManagerAssignment) của thị trường Mỹ.
export async function canEditUsShipments(user: { id: string; role: string | null | undefined }) {
  if (user.role === "SUPER_ADMIN") return true;
  const n = await prisma.salesManagerAssignment.count({ where: { managerId: user.id, market: { code: "US" } } });
  return n > 0;
}

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  const row = await prisma.systemConfig.findUnique({ where: { key: INVOICE_SETTINGS_KEY } });
  let saved: unknown = null;
  if (row) { try { saved = JSON.parse(row.value); } catch { saved = null; } }
  return mergeInvoiceSettings(saved);
}
export async function saveInvoiceSettings(s: InvoiceSettings) {
  const value = JSON.stringify(s);
  await prisma.systemConfig.upsert({
    where: { key: INVOICE_SETTINGS_KEY },
    create: { key: INVOICE_SETTINGS_KEY, value, description: "Cài đặt phí ship/thuế phiếu báo giá theo thị trường (JSON)" },
    update: { value },
  });
}

// Dữ liệu để tính 1 invoice: thị trường + bảng giá + tỉ giá áp dụng cho tháng của ngày invoice.
export async function loadInvoiceContext(marketId: string, invoiceDate: string, settings?: InvoiceSettings): Promise<InvoiceContext | null> {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    select: { code: true, name: true, currency: true, derivedCurrency: true, invoiceCalcKind: true },
  });
  if (!market) return null;
  const monthKey = invoiceDate.slice(0, 7);
  const [pl, rateMap, s] = await Promise.all([
    getEffectivePriceList(marketId, monthKey),
    getEffectiveRates(monthKey),
    settings ? Promise.resolve(settings) : getInvoiceSettings(),
  ]);
  return {
    market, settings: s, monthKey,
    priceList: pl ? {
      id: pl.id, month: dateToMonthKey(pl.month), currency: pl.currency, tiers: pl.tiers,
      items: pl.items.map((i) => ({ code: i.code, name: i.name, spec: i.spec, prices: i.prices as (number | null)[] })),
    } : null,
    rates: Object.fromEntries([...rateMap.entries()].map(([c, r]) => [c, { vndPerUnit: r.vndPerUnit, perUsd: r.perUsd }])),
  };
}

// Số phiếu báo giá: BG-yyMMdd-NN theo ngày lập (giờ VN), NN tăng dần trong ngày.
export async function nextInvoiceNo(): Promise<string> {
  const d = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).replace(/-/g, "").slice(2);
  const prefix = `BG-${d}-`;
  const last = await prisma.invoice.findFirst({ where: { invoiceNo: { startsWith: prefix } }, orderBy: { invoiceNo: "desc" }, select: { invoiceNo: true } });
  const n = last ? Number(last.invoiceNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(2, "0")}`;
}

// Phạm vi invoice 1 NV bán hàng được xem: của mình + của NV mình quản lý (SalesManagerAssignment.managerId = mình).
export async function invoiceScopeFor(user: { id: string; role: string | null | undefined }) {
  if (canViewAllInvoices(user.role)) return {};
  const managed = await prisma.salesManagerAssignment.findMany({ where: { managerId: user.id }, select: { salesUserId: true } });
  return { createdById: { in: [user.id, ...managed.map((m) => m.salesUserId)] } };
}

const num = z.number().finite();
const nnum = num.nullable();
const shipCats = SHIP_CATS.map((c) => c[0]) as [ShipCat, ...ShipCat[]];
export const invoiceInputSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  lines: z.array(z.object({
    key: z.string().max(300), qty: num.min(0), bag: num, manualPrice: nnum,
    shipCat: z.union([z.enum(shipCats), z.literal("")]), shipRate: nnum,
  })).max(300),
  manual: z.array(z.object({
    code: z.string().max(50), desc: z.string().max(300), spec: z.string().max(200), qty: num.min(0), unit: num.min(0), shipRate: nnum,
  })).max(100),
  us: z.object({
    shipmentDate: z.string().max(10), state: z.enum(US_STATES as [string, ...string[]]), resale: z.boolean(), ups: z.boolean(),
    boxMode: z.enum(["auto", "manual"]), boxes: z.array(z.object({ boxId: z.string(), count: num.min(0) })).max(30),
  }),
  eu: z.object({ nl: z.boolean(), lastMile: nnum, insurance: z.boolean(), tcBoxes: nnum, cutBoxes: num.min(0) }),
  au: z.object({ state: z.enum(AU_STATES as [string, ...string[]]), boxMode: z.enum(["auto", "manual"]), boxes: z.array(z.object({ idx: z.number().int().min(0), count: num.min(0) })).max(30) }),
  sea: z.object({ fullBox: z.boolean(), sgDoor: z.boolean(), minOverride: nnum }),
  simple: z.object({ shipping: nnum, shippingLabel: z.string().max(100) }),
  paypal: z.boolean(),
  extraFeeIds: z.array(z.string()).max(50),
}) satisfies z.ZodType<InvoiceInput>;

export const invoiceSaveSchema = z.object({
  marketId: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerId: z.string().nullable(),
  customerName: z.string().trim().min(1, "Nhập tên khách hàng").max(200),
  customerAddress: z.string().trim().max(500).nullable(),
  customerEmail: z.string().trim().max(200).nullable(),
  orderId: z.string().nullable(),
  companyProfileId: z.string().min(1, "Chọn thông tin công ty"),
  note: z.string().trim().max(1000).nullable(),
  input: invoiceInputSchema,
});

export { blankInvoiceInput };
