// Bộ tính invoice — chuyển từ Xanh Xanh Invoice Desk (compute/shipUS/EU/AU/SEA/SG), dùng chung client (xem trước)
// và server (tính lại lúc lưu, chụp kết quả vào Invoice.result). KHÔNG import Prisma.
//
// Khác bản gốc:
// - Tỉ giá lấy từ Tỉ giá tháng (ExchangeRate: 1 đơn vị = ? VND, 1 USD = ? đơn vị) thay vì tự nhập trong công cụ.
// - Mỗi khoản phí cài sẵn có ô bật/tắt + thêm "Phí khác" tuỳ thị trường (Admin cấp cao cài ở Cài đặt phiếu báo giá).
// - Thị trường có đơn vị tự tạo (VD Thái Lan THB → USD): giá + phí đổi theo tỉ giá VND của tháng.
import { tierRange } from "@/lib/price-list-shared";

// ───────────── Cài đặt ─────────────
export type UsBox = { id: string; kind: "TC" | "Rooted"; name: string; cap1: number; cap5: number; cap10: number; p45: number; p100: number; p200: number; p300: number; lmCA: number; lmW: number; lmE: number; note: string };
export type AuBox = { name: string; cap1: number; cap5: number; pack: number; qld: number; out: number };
export type EuSettings = { boxTC: number; boxTC5: number; boxCut: number; boxCut5: number; cap1: number; cap5: number; cap10: number; handlingEnabled: boolean; handlingMin: number; handlingThreshold: number; handlingPct: number; insurancePct: number };
export type ExtraFeeKind = "PCT_GOODS" | "PCT_TOTAL" | "PER_PLANT" | "FIXED";
// optional = NV bán hàng tự tick có tính cho từng invoice hay không; ngược lại luôn tính khi đang bật.
export type ExtraFee = { id: string; label: string; kind: ExtraFeeKind; value: number; enabled: boolean; optional: boolean };
export type InvoiceSettings = {
  v: 1;
  paypalPct: number;
  paypalEnabled: boolean;
  seaSurchargeUSD: number;
  // Phụ thu túi 1 cây theo mã thị trường, tính theo đơn vị tiền invoice (US/EU/AU và thị trường bán bằng USD).
  surcharge: Record<string, number>;
  us: {
    shipments: { date: string; kg: number }[];
    tlePct: number; tleEnabled: boolean;
    dutyPct: number; dutyEnabled: boolean;
    salesTaxPct: number; salesTaxEnabled: boolean;
    upsMult: number; upsAdd: number;
    boxes: UsBox[];
  };
  eu: EuSettings;
  // Thị trường khác dùng cách tính kiểu EU (Market.invoiceCalcKind = "EU", VD KR/CAN/UK/TQ/VN) — mỗi thị trường 1 bộ số
  // riêng theo đơn vị tiền gốc thị trường, ban đầu chép từ EU. Thị trường EU luôn dùng `eu` ở trên. Xem euSettingsFor.
  euMarkets: Record<string, EuSettings>;
  au: { shipTiers: { min: number; max: number; rate: number }[]; min5: number; min1: number; boxes: AuBox[]; gstPct: number; gstEnabled: boolean };
  sea: {
    // Phí ship/cây theo nhóm hàng, tính bằng đơn vị tiền gốc của thị trường (Market.currency).
    rates: Record<string, Partial<Record<ShipCat, number>>>;
    // Phí ship tối thiểu theo thị trường (đơn vị tiền gốc), null = không áp dụng.
    minShip: Record<string, number | null>;
    fullBoxPct: number; sgFreeThreshold: number; sgDoorFee: number;
  };
  extraFees: Record<string, ExtraFee[]>;
};

export const SHIP_CATS = [
  ["tc10", "Túi 10 cây"], ["tc1", "Túi 1 cây"], ["jar", "Lọ 1 cây"], ["s17", "Chậu rêu 1.7\""],
  ["m28", "Chậu rêu 2.8\" (lá < 15cm)"], ["l28", "Chậu rêu 2.8\" (lá 15–21cm)"], ["cut21", "Cành lá 15–21cm"],
  ["cut30", "Cành lá 22–30cm"], ["cut40", "Cành lá 31–40cm"], ["cut41", "Cành lá 40cm+"], ["full30", "Chậu đầy lá 22–30cm"], ["other", "Trường hợp khác"],
] as const;
export type ShipCat = (typeof SHIP_CATS)[number][0];

export const US_WEST = "AZ NV OR WA ID MT WY UT CO NM ND SD NE KS OK TX".split(" ");
export const US_EAST = "MN IA MO AR LA WI IL MI IN OH KY TN MS AL GA FL SC NC VA WV MD DE PA NJ NY CT RI MA VT NH ME".split(" ");
export const US_STATES = ["CA", ...US_WEST, ...US_EAST, "OTHER"];
export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "ACT", "NT", "TAS", "WA"];
export const US_MILESTONES = [45, 100, 200, 300] as const;

const EU_DEFAULT: EuSettings = { boxTC: 650, boxTC5: 650, boxCut: 850, boxCut5: 850, cap1: 680, cap5: 330, cap10: 165, handlingEnabled: true, handlingMin: 110, handlingThreshold: 5500, handlingPct: 2, insurancePct: 2 };

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  v: 1,
  paypalPct: 4.5, paypalEnabled: true,
  seaSurchargeUSD: 0.30,
  surcharge: { US: 0.30, EU: 0.26, AUS: 0.50, TH: 0.30, JP: 0.30, IN: 0.30, K: 0.30 },
  us: {
    shipments: [{ date: "2026-10-24", kg: 100 }, { date: "2026-10-31", kg: 45 }],
    tlePct: 4, tleEnabled: true, dutyPct: 13.8, dutyEnabled: true, salesTaxPct: 10, salesTaxEnabled: true, upsMult: 1.3, upsAdd: 25,
    boxes: [
      { id: "tc28", kind: "TC", name: "TC box 28×22×16", cap1: 140, cap5: 550, cap10: 700, p45: 139.88, p100: 77.06, p200: 69.15, p300: 52.60, lmCA: 59, lmW: 74, lmE: 95, note: "" },
      { id: "tc17", kind: "TC", name: "TC box 62×47×17", cap1: 370, cap5: 700, cap10: 900, p45: 384.95, p100: 212.08, p200: 190.31, p300: 144.76, lmCA: 71, lmW: 91, lmE: 116, note: "" },
      { id: "tc27", kind: "TC", name: "TC box 62×47×27", cap1: 500, cap5: 1000, cap10: 1200, p45: 611.39, p100: 336.84, p200: 302.25, p300: 229.91, lmCA: 88, lmW: 112, lmE: 144, note: "Kiểm tra lại với Hải" },
      { id: "tc40", kind: "TC", name: "TC box 62×47×40", cap1: 800, cap5: 1600, cap10: 2000, p45: 905.77, p100: 499.02, p200: 447.78, p300: 340.61, lmCA: 132, lmW: 162, lmE: 192, note: "Kiểm tra lại với Hải" },
      { id: "tc47", kind: "TC", name: "TC box 72×52×47", cap1: 2000, cap5: 2200, cap10: 2500, p45: 1367.42, p100: 753.36, p200: 676.01, p300: 514.22, lmCA: 216, lmW: 270, lmE: 324, note: "Kiểm tra lại với Hải" },
      { id: "r37", kind: "Rooted", name: "Rooted box 92×42×37", cap1: 0, cap5: 0, cap10: 0, p45: 1110.98, p100: 612.08, p200: 549.24, p300: 417.78, lmCA: 192, lmW: 252, lmE: 300, note: "200 S / 80–90 M / 50 L / 60 X / 30 Y — kiểm tra với Phụng" },
      { id: "r47", kind: "Rooted", name: "Rooted box 92×42×47", cap1: 0, cap5: 0, cap10: 0, p45: 1411.25, p100: 777.51, p200: 697.68, p300: 530.70, lmCA: 216, lmW: 276, lmE: 336, note: "400 S / 90–120 M / 80 L / 90 X / 50 Y — kiểm tra với Phụng" },
      { id: "r45", kind: "Rooted", name: "Rooted box 107×20×45", cap1: 0, cap5: 0, cap10: 0, p45: 748.33, p100: 412.28, p200: 369.95, p300: 281.41, lmCA: 132, lmW: 192, lmE: 240, note: "5 cành 40+ (size Z)" },
    ],
  },
  eu: { ...EU_DEFAULT },
  euMarkets: { KR: { ...EU_DEFAULT }, CAN: { ...EU_DEFAULT }, UK: { ...EU_DEFAULT }, TQ: { ...EU_DEFAULT }, VN: { ...EU_DEFAULT } },
  au: {
    shipTiers: [{ min: 1, max: 49, rate: 5.1 }, { min: 50, max: 99, rate: 3.0 }, { min: 100, max: 299, rate: 2.8 }, { min: 300, max: 500, rate: 2.1 }, { min: 501, max: 1000, rate: 2.0 }, { min: 1001, max: 999999, rate: 1.4 }],
    min5: 20, min1: 10,
    boxes: [
      { name: "Medium Box 240×190×120", cap1: 30, cap5: 12, pack: 35, qld: 22, out: 30 },
      { name: "Large Box 390×280×140", cap1: 60, cap5: 24, pack: 48, qld: 40, out: 55 },
      { name: "Extra Large Box 440×277×168", cap1: 100, cap5: 40, pack: 65, qld: 50, out: 75 },
      { name: "BX5 405×300×255", cap1: 200, cap5: 80, pack: 85, qld: 65, out: 85 },
    ],
    gstPct: 10, gstEnabled: true,
  },
  sea: {
    rates: {
      TH: { tc10: 20, tc1: 40, jar: 50, s17: 78, m28: 151, l28: 207, cut21: 217 },
      ID: { tc10: 15802, tc1: 26338, jar: 39506, s17: 63210, m28: 133716, l28: 183487, cut21: 193145 },
      PH: { tc10: 33, tc1: 67, jar: 86, s17: 135, m28: 286, l28: 392, cut21: 414 },
      SG: { tc10: 0.31, tc1: 0.62, jar: 0.78, s17: 1.24, m28: 2.38, l28: 3.28, cut21: 3.45 },
      IN: {}, JP: {}, K: {},
    },
    minShip: { TH: 1000, ID: 1899671, PH: 4277, SG: 6, IN: 150, JP: null, K: null },
    fullBoxPct: 15, sgFreeThreshold: 50, sgDoorFee: 12,
  },
  extraFees: {},
};

// Gộp cài đặt đã lưu lên mặc định (thêm field mới không làm hỏng bản cũ). Mảng thì lấy nguyên bản đã lưu.
export function mergeInvoiceSettings(saved: unknown): InvoiceSettings {
  const out = JSON.parse(JSON.stringify(DEFAULT_INVOICE_SETTINGS));
  (function deep(t: Record<string, unknown>, s: Record<string, unknown>) {
    for (const k in s) {
      const sv = s[k], tv = t[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) deep(tv as Record<string, unknown>, sv as Record<string, unknown>);
      else t[k] = sv;
    }
  })(out, (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>);
  return out;
}

// ───────────── Định dạng tiền ─────────────
const SYM: Record<string, string> = { USD: "$", EUR: "€", AUD: "A$", THB: "฿", IDR: "Rp ", PHP: "₱", SGD: "S$", VND: "₫ " };
const DEC: Record<string, number> = { IDR: 0, VND: 0 };
export const decimalsOf = (cur: string) => DEC[cur] ?? 2;
export function roundCur(v: number, cur: string) { const f = 10 ** decimalsOf(cur); return Math.round((v + Number.EPSILON) * f) / f; }
export function fmtMoney(v: number | null | undefined, cur: string) {
  if (v == null || Number.isNaN(v)) return "—";
  const d = decimalsOf(cur);
  return (v < 0 ? "−" : "") + (SYM[cur] ?? cur + " ") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ───────────── Đầu vào ─────────────
export type InvoiceMarket = { code: string; name: string; currency: string; derivedCurrency: string | null; invoiceCalcKind: string };
export type InvoicePriceItem = { code: string; name: string; spec: string; prices: (number | null)[] };
export type InvoicePriceList = { id: string; month: string; currency: string; tiers: string[]; items: InvoicePriceItem[] };
export type InvoiceRate = { vndPerUnit: number; perUsd: number | null };

export type InvoiceLine = { key: string; qty: number; bag: number; manualPrice: number | null; shipCat: ShipCat | ""; shipRate: number | null };
export type InvoiceManualLine = { code: string; desc: string; spec: string; qty: number; unit: number; shipRate: number | null };
export type InvoiceInput = {
  currency: string; // đơn vị tiền phiếu báo giá: Market.currency hoặc Market.derivedCurrency
  lines: InvoiceLine[];
  manual: InvoiceManualLine[];
  us: { shipmentDate: string; state: string; resale: boolean; ups: boolean; boxMode: "auto" | "manual"; boxes: { boxId: string; count: number }[] };
  eu: { nl: boolean; lastMile: number | null; insurance: boolean; tcBoxes: number | null; cutBoxes: number };
  au: { state: string; boxMode: "auto" | "manual"; boxes: { idx: number; count: number }[] };
  sea: { fullBox: boolean; sgDoor: boolean; minOverride: number | null };
  simple: { shipping: number | null; shippingLabel: string };
  paypal: boolean;
  extraFeeIds: string[]; // phí khác loại "optional" NV bán hàng đã tick
};

export function blankInvoiceInput(currency: string): InvoiceInput {
  return {
    currency, lines: [], manual: [],
    us: { shipmentDate: "", state: "CA", resale: false, ups: false, boxMode: "auto", boxes: [{ boxId: "r37", count: 1 }] },
    eu: { nl: true, lastMile: null, insurance: false, tcBoxes: null, cutBoxes: 0 },
    au: { state: "QLD", boxMode: "auto", boxes: [{ idx: 0, count: 1 }] },
    sea: { fullBox: false, sgDoor: false, minOverride: null },
    simple: { shipping: null, shippingLabel: "Phí vận chuyển" },
    paypal: false, extraFeeIds: [],
  };
}

export const priceKey = (p: { code: string; spec: string }) => `${p.code}|${p.spec}`;
const isRegionKind = (kind: string) => kind === "SEA" || kind === "SG";
export function isTcProduct(kind: string, p: { spec: string }) { return !isRegionKind(kind) || /tissue bag/i.test(p.spec); }

export function autoShipCat(p: { spec: string }, bag: number): ShipCat {
  const s = p.spec.toLowerCase();
  if (/tissue bag/.test(s)) return bag === 1 ? "tc1" : "tc10";
  if (/full pot/.test(s)) return "full30";
  if (/1[.,]7\s*inch/.test(s)) return "s17";
  if (/2[.,]8\s*inch/.test(s)) return /15-21/.test(s) ? "l28" : "m28";
  if (/cut/.test(s)) {
    if (/41cm\+|40cm\+/.test(s)) return "cut41";
    const m = s.match(/(\d+)\s*-\s*(\d+)\s*cm/) || s.match(/(\d+)\s*cm\s*\+/);
    if (m) { const hi = +(m[2] || m[1]); return hi <= 21 ? "cut21" : hi <= 30 ? "cut30" : hi <= 40 ? "cut40" : "cut41"; }
  }
  return "other";
}

export function lookupPrice(tiers: string[], prices: (number | null)[], qty: number):
  | { price: number; tier: string; moq: number | null; err?: undefined }
  | { err: "moq"; moq: number }
  | { err: "notier"; tier: string; suggest: number | null; suggestTier: string | null } {
  const r = tiers.map((t) => tierRange(t) ?? [0, -1]);
  const first = prices.findIndex((v) => v != null);
  const moq = first < 0 ? null : r[first][0];
  if (moq != null && qty < moq) return { err: "moq", moq };
  const i = r.findIndex(([a, b]) => qty >= a && qty <= b);
  if (i < 0) return { err: "moq", moq: r[0]?.[0] ?? 0 };
  if (prices[i] == null) {
    const last = prices.map((v, j) => (v == null ? -1 : j)).filter((j) => j >= 0).pop();
    return { err: "notier", tier: tiers[i], suggest: last != null ? prices[last] : null, suggestTier: last != null ? tiers[last] : null };
  }
  return { price: prices[i] as number, tier: tiers[i], moq };
}

// ───────────── Kết quả ─────────────
export type InvoiceFee = { label: string; amount: number; group: "ship" | "fee" | "tax" | "pay" | "other"; detail?: string; inTotal?: boolean };
export type InvoiceItem = { manual: boolean; code: string; name: string; spec: string; qty: number; unit: number; sur: number; nBags: number; amount: number; manualPrice: boolean; lineIndex: number | null };
export type LinePill = { tone: "ok" | "warn" | "bad" | ""; text: string };
export type InvoiceResult = {
  currency: string; items: InvoiceItem[]; fees: InvoiceFee[]; warnings: string[]; blockers: string[];
  linePills: LinePill[][]; goods: number; total: number; pending: boolean; boxNote: string | null;
  plants: number; hasManualPrice: boolean; combineShip: boolean;
};

export type InvoiceContext = {
  market: InvoiceMarket;
  priceList: InvoicePriceList | null;
  settings: InvoiceSettings;
  rates: Record<string, InvoiceRate>;
  monthKey: string;
};

function fillOf(box: { cap1: number; cap5: number; cap10: number }, b: Record<1 | 5 | 10, number>) {
  const parts: [number, number][] = [[b[1], box.cap1], [b[5], box.cap5], [b[10], box.cap10]];
  let f = 0;
  for (const [n, c] of parts) { if (!n) continue; if (!c) return Infinity; f += n / c; }
  return f;
}
function autoBoxes<T extends { cap1: number; cap5: number; cap10: number }>(boxes: T[], b: Record<1 | 5 | 10, number>, priceOf: (x: T) => number) {
  const fits = boxes.filter((x) => fillOf(x, b) <= 1 + 1e-9).sort((a, c) => priceOf(a) - priceOf(c));
  if (fits.length) return [{ box: fits[0], count: 1 }];
  const big = boxes.slice().sort((a, c) => fillOf(a, b) - fillOf(c, b))[0];
  if (!big) return [];
  const f = fillOf(big, b); const full = Math.floor(f); const rem = f - full;
  const out = [{ box: big, count: full }];
  if (rem > 1e-9) {
    const scale = rem / f; const rb = { 1: b[1] * scale, 5: b[5] * scale, 10: b[10] * scale };
    const r = boxes.filter((x) => fillOf(x, rb) <= 1 + 1e-9).sort((a, c) => priceOf(a) - priceOf(c))[0] || big;
    if (r === big) out[0].count++; else out.push({ box: r, count: 1 });
  }
  return out.filter((p) => p.count > 0);
}

export function computeInvoice(ctx: InvoiceContext, O: InvoiceInput): InvoiceResult {
  const { market: M, priceList: q, settings: S, rates } = ctx;
  const kind = M.invoiceCalcKind;
  const base = M.currency;
  const cur = O.currency === M.derivedCurrency && M.derivedCurrency ? M.derivedCurrency : base;
  const res: InvoiceResult = {
    currency: cur, items: [], fees: [], warnings: [], blockers: [], linePills: O.lines.map(() => []),
    goods: 0, total: 0, pending: false, boxNote: null, plants: 0, hasManualPrice: false, combineShip: false,
  };
  const fee = (label: string, amount: number, group: InvoiceFee["group"], extra: Partial<InvoiceFee> = {}) =>
    res.fees.push({ label, amount: roundCur(amount, cur), group, ...extra });

  // Đổi base → cur qua VND. Thiếu tỉ giá → chặn.
  let fx = 1;
  if (cur !== base) {
    const a = rates[base], b = rates[cur];
    if (!a || !b) { res.blockers.push(`Chưa có tỉ giá ${base}/${cur} ${ctx.monthKey} — NV Kế toán cần nhập ở Tỉ giá tháng`); res.pending = true; }
    else fx = a.vndPerUnit / b.vndPerUnit;
  }
  const conv = (v: number) => v * fx;

  if (!q) res.blockers.push(`Thị trường ${M.name} chưa có bảng giá đã duyệt — chỉ nhập được dòng nhập tay`);
  const byKey = new Map((q?.items ?? []).map((p) => [priceKey(p), p]));

  const agg = new Map<string, number>();
  for (const l of O.lines) if (l.key) agg.set(l.key, (agg.get(l.key) ?? 0) + (+l.qty || 0));
  const bags: Record<1 | 5 | 10, number> = { 1: 0, 5: 0, 10: 0 };
  const tcByLine: (InvoiceItem & { bag: number; tc: boolean; p: InvoicePriceItem } | null)[] = [];

  O.lines.forEach((l, idx) => {
    const pills = res.linePills[idx];
    const p = l.key ? byKey.get(l.key) : undefined;
    tcByLine.push(null);
    if (!p) { if (l.key) { pills.push({ tone: "bad", text: "Mã này không có trong bảng giá đang áp dụng" }); res.blockers.push(`Dòng ${idx + 1}: mã không có trong bảng giá`); } return; }
    const qty = +l.qty || 0;
    if (qty <= 0) { pills.push({ tone: "warn", text: "Nhập số lượng" }); return; }
    const tc = isTcProduct(kind, p);
    const bag = tc ? ([1, 5, 10].includes(+l.bag) ? +l.bag : 10) : 0;
    let unit: number;
    let manualPrice = false;
    if (l.manualPrice != null && l.manualPrice > 0) {
      unit = l.manualPrice; manualPrice = true; res.hasManualPrice = true;
      pills.push({ tone: "warn", text: `Giá nhập tay ${fmtMoney(unit, cur)}/cây — cần Admin cấp cao duyệt` });
    } else {
      const lp = lookupPrice(q!.tiers, p.prices, agg.get(l.key) ?? qty);
      if (lp.err === "moq") { pills.push({ tone: "bad", text: `Dưới số lượng tối thiểu — tối thiểu ${lp.moq} cây (đang ${agg.get(l.key)})` }); res.blockers.push(`${p.name}: dưới số lượng tối thiểu ${lp.moq} cây`); return; }
      if (lp.err === "notier") {
        pills.push({ tone: "bad", text: `Không có giá bậc ${lp.tier}.${lp.suggest != null ? ` Bậc gần nhất ${lp.suggestTier}: ${fmtMoney(roundCur(conv(lp.suggest), cur), cur)}` : ""} — nhập giá tay nếu muốn dùng` });
        res.blockers.push(`${p.name}: không có giá bậc ${lp.tier}`); return;
      }
      unit = roundCur(conv(lp.price), cur);
      pills.push({ tone: "ok", text: `Bậc ${lp.tier}: ${fmtMoney(unit, cur)}/cây` });
      if (lp.moq) pills.push({ tone: "", text: `Tối thiểu ${lp.moq}` });
    }
    let sur = 0, nBags = 0;
    if (tc) {
      const raw = qty / bag;
      if (!Number.isInteger(raw)) pills.push({ tone: "warn", text: `${qty} cây không chia tròn túi ${bag}` });
      nBags = Math.ceil(raw); bags[bag as 1 | 5 | 10] += nBags;
      const needsSur = bag === 1 && (!isRegionKind(kind) || /tissue bag 10/i.test(p.spec));
      if (needsSur) {
        const s = surchargeFor(ctx, cur);
        if ("err" in s) { pills.push({ tone: "bad", text: s.err }); res.blockers.push(s.err); res.pending = true; }
        else { sur = s.value; pills.push({ tone: "", text: `Phụ thu túi 1 cây: ${s.label}` }); }
      } else if (bag === 1 && isRegionKind(kind)) pills.push({ tone: "", text: "Quy cách túi 1 — không phụ thu" });
    }
    res.plants += qty;
    const amount = roundCur(unit * qty, cur) + roundCur(sur * (tc && bag === 1 ? nBags : 0), cur);
    const item: InvoiceItem = {
      manual: false, code: p.code, name: p.name,
      spec: tc ? `TC bag of ${bag} plant${bag > 1 ? "s" : ""}` : p.spec,
      qty, unit, sur: tc && bag === 1 ? sur : 0, nBags, amount, manualPrice, lineIndex: idx,
    };
    res.items.push(item);
    tcByLine[idx] = { ...item, bag, tc, p };
  });
  for (const m of O.manual) {
    const qty = +m.qty || 0, unit = +m.unit || 0;
    if (!m.desc && !qty) continue;
    res.hasManualPrice = true;
    res.items.push({ manual: true, code: m.code || "—", name: m.desc || "Cây nhập tay", spec: m.spec || "Rooted / cutting", qty, unit, sur: 0, nBags: 0, amount: roundCur(qty * unit, cur), manualPrice: true, lineIndex: null });
  }
  res.goods = roundCur(res.items.reduce((a, i) => a + i.amount, 0), cur);

  const shipCtx = { ctx, O, res, fee, bags, cur, conv, tcByLine };
  if (kind === "US") shipUS(shipCtx);
  else if (kind === "EU") shipEU(shipCtx);
  else if (kind === "AU") shipAU(shipCtx);
  else if (kind === "SEA") shipSEA(shipCtx);
  else if (kind === "SG") shipSG(shipCtx);
  else if (O.simple.shipping != null) fee(O.simple.shipping ? (O.simple.shippingLabel || "Phí vận chuyển") : "Phí vận chuyển", O.simple.shipping, "ship");

  // Phí khác cài theo thị trường.
  const sumFees = () => res.fees.reduce((a, f) => a + (f.inTotal === false ? 0 : f.amount), 0);
  for (const f of S.extraFees[M.code] ?? []) {
    if (!f.enabled) continue;
    if (f.optional && !O.extraFeeIds.includes(f.id)) continue;
    const v = f.kind === "PCT_GOODS" ? res.goods * f.value / 100
      : f.kind === "PCT_TOTAL" ? (res.goods + sumFees()) * f.value / 100
      : f.kind === "PER_PLANT" ? conv(f.value) * (res.plants + O.manual.reduce((a, m) => a + (+m.qty || 0), 0))
      : conv(f.value);
    const suffix = f.kind === "PCT_GOODS" ? ` ${f.value}% giá trị hàng` : f.kind === "PCT_TOTAL" ? ` ${f.value}% tổng` : "";
    fee(`${f.label}${suffix}`, v, "other");
  }

  let total = res.goods + sumFees();
  if (O.paypal && S.paypalEnabled) {
    const pf = roundCur(total * S.paypalPct / 100, cur);
    res.fees.push({ label: `PayPal fee ${S.paypalPct}% of order total`, amount: pf, group: "pay" });
    total += pf;
  }
  res.total = roundCur(total, cur);
  return res;
}

// Phụ thu túi 1 cây. Thị trường bán bằng đơn vị tiền địa phương (Đông Nam Á): seaSurchargeUSD × (1 USD = ? đơn vị) của tháng.
function surchargeFor(ctx: InvoiceContext, cur: string): { value: number; label: string } | { err: string } {
  const { market: M, settings: S, rates } = ctx;
  if (!isRegionKind(M.invoiceCalcKind) || cur === "USD") {
    const v = S.surcharge[M.code] ?? (cur === "USD" ? S.seaSurchargeUSD : 0);
    return { value: v, label: `${fmtMoney(v, cur)}/túi` };
  }
  const r = rates[cur]?.perUsd;
  if (!r) return { err: `Chưa có tỉ giá 1 USD = ? ${cur} tháng ${ctx.monthKey} — cần cho phụ thu túi 1 cây (${S.seaSurchargeUSD} USD/túi)` };
  const v = roundCur(S.seaSurchargeUSD * r, cur);
  return { value: v, label: `${S.seaSurchargeUSD} USD × ${r.toLocaleString("en-US", { maximumFractionDigits: 4 })} = ${fmtMoney(v, cur)}/túi` };
}

type ShipCtx = {
  ctx: InvoiceContext; O: InvoiceInput; res: InvoiceResult; cur: string;
  fee: (label: string, amount: number, group: InvoiceFee["group"], extra?: Partial<InvoiceFee>) => void;
  bags: Record<1 | 5 | 10, number>; conv: (v: number) => number;
  tcByLine: ({ bag: number; tc: boolean; p: InvoicePriceItem; qty: number; name: string } | null)[];
};

function shipUS({ ctx, O, res, fee, bags, cur, conv }: ShipCtx) {
  const U = ctx.settings.us, o = O.us;
  const sh = U.shipments.find((s) => s.date === o.shipmentDate);
  if (!sh) { res.blockers.push("Chưa chọn chuyến hàng Mỹ (NV Quản lý thị trường Mỹ cập nhật lịch chuyến ở Cài đặt phiếu báo giá)"); res.pending = true; return; }
  const pk = `p${sh.kg}` as "p45" | "p100" | "p200" | "p300";
  const zone = o.state === "CA" ? "lmCA" : US_WEST.includes(o.state) ? "lmW" : US_EAST.includes(o.state) ? "lmE" : null;
  const zoneLabel = zone ? { lmCA: "California", lmW: "Central & Western States", lmE: "Eastern & Southeastern States" }[zone] : "";
  const hasManual = res.items.some((i) => i.manual);
  let picks: { box: UsBox; count: number }[];
  if (o.boxMode === "auto" && !hasManual) {
    if (!bags[1] && !bags[5] && !bags[10]) { res.pending = true; return; }
    picks = autoBoxes(U.boxes.filter((b) => b.kind === "TC"), bags, (b) => b[pk] ?? 0);
    res.boxNote = picks.map((p) => `${p.count} × ${p.box.name}`).join(" + ");
    picks.forEach((p) => { if (p.box.note) res.warnings.push(`${p.box.name}: ${p.box.note}`); });
  } else {
    if (o.boxMode === "auto" && hasManual) res.warnings.push("Đơn có cây rễ/cành nhập tay → chọn thùng thủ công theo kích thước vườn xác nhận.");
    picks = o.boxes.map((b) => ({ box: U.boxes.find((x) => x.id === b.boxId)!, count: +b.count || 0 })).filter((p) => p.box && p.count > 0);
    if (!picks.length) { res.blockers.push("Chưa chọn thùng đóng hàng"); res.pending = true; return; }
    res.boxNote = picks.map((p) => `${p.count} × ${p.box.name}`).join(" + ");
  }
  const freight = picks.reduce((a, p) => a + (p.box[pk] || 0) * p.count, 0);
  fee(`Freight VN → US customs clearance (shipment ${sh.date}, ${sh.kg}kg tier)`, conv(freight), "ship", { detail: picks.map((p) => `${p.count} × ${p.box.name} @ ${fmtMoney(p.box[pk], cur)}`).join("; ") });
  if (!zone) res.blockers.push("Bang này không có trong bảng phí chặng cuối — kiểm tra phí ship riêng");
  else {
    let lm = picks.reduce((a, p) => a + (p.box[zone] || 0) * p.count, 0);
    let det = picks.map((p) => `${p.count} × ${fmtMoney(p.box[zone], cur)}`).join(" + ");
    if (o.ups) { lm = picks.reduce((a, p) => a + ((p.box[zone] || 0) * U.upsMult + U.upsAdd) * p.count, 0); det = `UPS = FedEx × ${U.upsMult * 100}% + $${U.upsAdd}/box`; }
    fee(`Ship last mile ${o.ups ? "UPS Next Day Air Saver" : "FedEx Priority Overnight"} → ${o.state} (${zoneLabel})`, conv(lm), "ship", { detail: det });
  }
  if (U.tleEnabled) fee(`TLE import service fee ${U.tlePct}% of goods value`, res.goods * U.tlePct / 100, "fee");
  if (U.dutyEnabled) fee(`Duty tax ${U.dutyPct}% of goods value`, res.goods * U.dutyPct / 100, "fee");
  if (U.salesTaxEnabled) {
    if (!o.resale) fee(`Sales tax ${U.salesTaxPct}% (no resale certificate)`, res.goods * U.salesTaxPct / 100, "fee");
    else res.warnings.push("Nhớ thu resale certificate và cập nhật file theo dõi trước khi xác nhận đơn.");
  }
  res.combineShip = true;
}

// Bộ số kiểu EU của 1 thị trường: EU dùng settings.eu, thị trường khác dùng euMarkets[mã] (chưa có thì lấy theo EU).
export function euSettingsFor(S: InvoiceSettings, code: string): EuSettings {
  return code === "EU" ? S.eu : S.euMarkets?.[code] ?? S.eu;
}

function shipEU({ ctx, O, res, fee, bags, conv }: ShipCtx) {
  const E = euSettingsFor(ctx.settings, ctx.market.code), o = O.eu;
  const isEU = ctx.market.code === "EU";
  const base = ctx.market.currency;
  if (!o.nl) { res.warnings.push(isEU ? "Giao ngoài Hà Lan: phiếu báo giá chỉ gồm tiền hàng, phí ship báo riêng." : "Không tính phí vận chuyển: phiếu báo giá chỉ gồm tiền hàng, phí ship báo riêng."); return; }
  const f = bags[1] / E.cap1 + bags[5] / E.cap5 + bags[10] / E.cap10;
  const autoTC = res.plants ? Math.max(1, Math.ceil(f - 1e-9)) : 0;
  const tcBoxes = o.tcBoxes ?? autoTC; const cutBoxes = +o.cutBoxes || 0;
  const totalBoxes = tcBoxes + cutBoxes;
  if (!totalBoxes) { res.pending = true; return; }
  const tcRate = totalBoxes >= 5 ? E.boxTC5 : E.boxTC, cutRate = totalBoxes >= 5 ? E.boxCut5 : E.boxCut;
  res.boxNote = `${tcBoxes} TC box(es)${cutBoxes ? ` + ${cutBoxes} cutting box(es)` : ""} (TC box ${Math.round(f * 100)}% full)`;
  fee(isEU ? "DPU AMS freight (VN → cleared quarantine at AMS)" : "Freight (VN → destination)", conv(tcBoxes * tcRate + cutBoxes * cutRate), "ship", { detail: `${tcBoxes} × ${fmtMoney(tcRate, base)}${cutBoxes ? ` + ${cutBoxes} × ${fmtMoney(cutRate, base)}` : ""}` });
  if (E.handlingEnabled) {
    const small = res.goods <= conv(E.handlingThreshold);
    fee(`${isEU ? "Handling Fertiplant BV" : "Handling"} (${small ? `order ≤ ${fmtMoney(E.handlingThreshold, base)}: minimum` : `${E.handlingPct}% of order value`})`, small ? conv(E.handlingMin) : res.goods * E.handlingPct / 100, "fee");
  }
  if (o.insurance) fee(`${isEU ? "DHL last-mile" : "Shipping"} insurance ${E.insurancePct}% of goods value`, res.goods * E.insurancePct / 100, "fee");
  if (o.lastMile == null) { res.blockers.push(isEU ? "Nhập phí DHL chặng cuối (theo địa chỉ, cân nặng, kích thước thùng)" : "Nhập phí giao chặng cuối (theo địa chỉ, cân nặng, kích thước thùng)"); res.pending = true; }
  else fee(isEU ? "Last-mile shipping DHL 2 days (AMS → customer address)" : "Last-mile shipping (to customer address)", o.lastMile, "ship");
  if (totalBoxes >= 5) res.warnings.push("Từ 5 thùng: giá cước \"đang cập nhật\" — kiểm tra lại ở Cài đặt phiếu báo giá.");
}

function shipAU({ ctx, O, res, fee, bags, conv }: ShipCtx) {
  const A = ctx.settings.au, o = O.au;
  if (res.items.some((i) => i.manual)) res.blockers.push("Leafia chỉ ship cây mô sang Úc — không nhận cây rễ.");
  if (o.state === "TAS" || o.state === "WA") { res.blockers.push(`Không ship tới ${o.state}.`); return; }
  if (!res.plants) { res.pending = true; return; }
  const plants5 = bags[5] * 5 + bags[10] * 10, n1 = bags[1];
  if (plants5 && plants5 < A.min5) res.warnings.push(`Quy cách túi 5: tối thiểu ${A.min5} cây (đang ${plants5}).`);
  if (n1 && n1 < A.min1) res.warnings.push(`Túi 1: tối thiểu ${A.min1} túi (đang ${n1}).`);
  const tier = A.shipTiers.find((t) => res.plants >= t.min && res.plants <= t.max) || A.shipTiers[A.shipTiers.length - 1];
  fee(`Shipping VN → QLD warehouse (${res.plants} plants × A$${tier.rate})`, conv(res.plants * tier.rate), "ship");
  const b = { 1: n1, 5: bags[5] + bags[10] * 2, 10: 0 } as Record<1 | 5 | 10, number>;
  const boxes = A.boxes.map((x) => ({ ...x, cap10: 1 }));
  const picks = o.boxMode === "auto"
    ? autoBoxes(boxes, b, (x) => x.pack + x.out)
    : o.boxes.map((x) => ({ box: boxes[x.idx], count: +x.count || 0 })).filter((p) => p.box && p.count);
  if (!picks.length) { res.pending = true; return; }
  res.boxNote = picks.map((p) => `${p.count} × ${p.box.name}`).join(" + ");
  const inQ = o.state === "QLD";
  fee("Leafia packing & order splitting", conv(picks.reduce((a, p) => a + p.box.pack * p.count, 0)), "ship", { detail: res.boxNote });
  fee(`Last-mile AUS Post → ${o.state} (${inQ ? "within QLD" : "outside QLD"})`, conv(picks.reduce((a, p) => a + (inQ ? p.box.qld : p.box.out) * p.count, 0)), "ship");
  if (A.gstEnabled) {
    const baseAmt = res.goods + res.fees.reduce((a, f) => a + f.amount, 0);
    fee(`GST ${A.gstPct}% of total order value`, baseAmt * A.gstPct / 100, "tax");
  }
  res.combineShip = true;
}

function shipSEA({ ctx, O, res, fee, cur, conv, tcByLine }: ShipCtx) {
  const M = ctx.market, S = ctx.settings;
  const rates = S.sea.rates[M.code] ?? {};
  let ship = 0;
  const missing: string[] = [];
  O.lines.forEach((l, idx) => {
    const it = tcByLine[idx];
    if (!it) return;
    const cat = l.shipCat || autoShipCat(it.p, it.bag);
    const pills = res.linePills[idx];
    const rate = l.shipRate != null ? l.shipRate : rates[cat] != null ? conv(rates[cat]!) : null;
    const catLabel = SHIP_CATS.find((c) => c[0] === cat)?.[1] ?? cat;
    if (rate == null) { missing.push(it.name); pills.push({ tone: "warn", text: `Ship "${catLabel}": chưa có — nhập phí/cây` }); return; }
    if (it.bag === 5 && !l.shipCat && cat === "tc10") pills.push({ tone: "warn", text: "Túi 5 tạm tính phí ship túi 10 — kiểm tra" });
    ship += rate * it.qty;
    pills.push({ tone: "", text: `Ship ${fmtMoney(roundCur(rate, cur), cur)}/cây` });
  });
  for (const m of O.manual) { if ((+m.qty || 0) && m.shipRate == null) missing.push(m.desc || "cây nhập tay"); else ship += (m.shipRate || 0) * (+m.qty || 0); }
  if (missing.length) { res.blockers.push("Thiếu phí ship/cây cho: " + missing.join(", ")); res.pending = true; }
  if (O.sea.fullBox) ship *= 1 - S.sea.fullBoxPct / 100;
  const minRaw = O.sea.minOverride ?? S.sea.minShip[M.code] ?? null;
  const min = minRaw == null ? null : conv(minRaw);
  let label = `Per-plant shipping${O.sea.fullBox ? ` (${S.sea.fullBoxPct}% off for a full 92×47×42 box)` : ""}`;
  if (min != null && ship < min) { res.warnings.push(`Phí ship theo cây ${fmtMoney(roundCur(ship, cur), cur)} thấp hơn tối thiểu → áp mức tối thiểu ${fmtMoney(roundCur(min, cur), cur)}.`); ship = min; label = "Shipping (minimum)"; }
  fee(label, ship, "ship");
  if (cur !== M.currency) res.warnings.push(`Phí ship tính bằng ${M.currency} rồi đổi sang ${cur} theo tỉ giá VND tháng ${ctx.monthKey}.`);
  res.warnings.push("Giá ship tạm tính: phát sinh thêm sẽ thu bổ sung, dư sẽ trừ vào đơn sau.");
}

function shipSG({ ctx, O, res, fee, conv }: ShipCtx) {
  const S = ctx.settings.sea;
  const thr = S.sgFreeThreshold;
  const min = O.sea.minOverride ?? S.minShip[ctx.market.code] ?? 0;
  if (res.goods >= conv(thr)) fee(`Free shipping to Telok Kurau (order ≥ S$${thr})`, 0, "ship");
  else fee(`Minimum shipping fee (order under S$${thr})`, conv(min), "ship");
  if (O.sea.sgDoor) fee("Door-to-door delivery (customer pays the delivery partner directly)", conv(S.sgDoorFee), "ship", { inTotal: false });
  res.warnings.push("Giá Singapore đã gồm ship tới Telok Kurau. Thanh toán đủ trước khi giao (PayNow/PayLah).");
}

// Dòng phí hiển thị cho khách: Mỹ/Úc gộp các dòng ship thành 1.
export function customerFeeRows(r: InvoiceResult, kind: string): InvoiceFee[] {
  if (!r.combineShip) return r.fees;
  const ship = r.fees.filter((f) => f.group === "ship" && f.inTotal !== false);
  const others = r.fees.filter((f) => !(f.group === "ship" && f.inTotal !== false));
  const sum = roundCur(ship.reduce((a, f) => a + f.amount, 0), r.currency);
  const head: InvoiceFee[] = ship.length ? [{ label: kind === "AU" ? "Shipping & handling" : "Shipping (VN → US + last mile)", amount: sum, group: "ship" }] : [];
  return head.concat(others);
}
