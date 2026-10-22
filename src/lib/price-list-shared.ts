// Phần dùng chung client/server của Bảng giá tháng (PriceList) — KHÔNG import Prisma.

// Tháng theo giờ VN, dạng "yyyy-MM".
export function vnMonthKey(d: Date = new Date()): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
}
export function addMonthsKey(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
// Ngày 1 của tháng — lưu cột @db.Date (UTC 00:00 đúng ngày 1, không lệch múi giờ).
export function monthKeyToDate(key: string): Date {
  return new Date(`${key}-01T00:00:00.000Z`);
}
export function dateToMonthKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 7);
}
export function monthLabelVi(key: string): string {
  const [y, m] = key.split("-");
  return `tháng ${Number(m)}/${y}`;
}

// Nhãn bậc số lượng hợp lệ: "5-9", "200+", "1".
export const TIER_RE = /^\s*(\d+)\s*(?:-\s*(\d+)|(\+))?\s*$/;
export function tierRange(label: string): [number, number] | null {
  const m = label.match(TIER_RE);
  if (!m) return null;
  const a = Number(m[1]);
  if (m[2]) return [a, Number(m[2])];
  if (m[3]) return [a, Number.POSITIVE_INFINITY];
  return [a, a];
}

// Đối chiếu mã/quy cách báo giá sang mã cây + quy cách hệ thống:
// - Mã: 2 chữ + số (+ hậu tố quy cách), số đệm đủ 3 chữ số — "AL62" → AL062, "MT001T10" → MT001 + T10.
// - Quy cách: "Tissue bag 10 plant" → T10, "Tissue bag 1 plant" → T01, chậu 1,7 inch → S, 2,8 inch → M, 3,5 inch → L,
//   full pot / chậu 6 inch → L, cành lá đến 30cm → X, 31-40cm → Y, 40cm+ → Z, node thân đốt + lá mẹ → C
//   (xem POT_SPEC_DESCRIPTIONS); "Tissue culture" (báo giá TC Mỹ/EU/Úc) → null = mọi loại túi; còn lại chưa có quy đổi → null.
// Cành theo cỡ lá: đến 30cm → X (gồm 15-17, 16-18, 16-22, 18-25, 20-30cm — Admin cấp cao chốt 22/10/2026), 31-40cm → Y,
// 40cm+ (41cm+) → Z. Cành "mature form" (không ghi cỡ) → X. Không có cỡ khác → null = chưa quy đổi.
function cuttingStage(s: string): string | null {
  if (/mature form/.test(s)) return "X";
  const plus = s.match(/(\d+)\s*cm\s*\+/);
  if (plus) return Number(plus[1]) >= 40 ? "Z" : null;
  const r = s.match(/(\d+)\s*-\s*(\d+)\s*cm/);
  if (!r) return null;
  const a = Number(r[1]), b = Number(r[2]);
  if (b <= 30) return "X";
  if (a >= 31 && b <= 40) return "Y";
  return null;
}

export function mapPriceCode(code: string, spec: string): { plantCode: string | null; stageCode: string | null; stageMapped: boolean } {
  const m = code.trim().toUpperCase().match(/^([A-Z]{2})(\d{1,3})([A-Z]\d{2})?$/);
  const plantCode = m ? `${m[1]}${m[2].padStart(3, "0")}` : null;
  const s = spec.toLowerCase();
  let stageCode: string | null = null;
  let stageMapped = true;
  const bag = s.match(/tissue bag\s*(\d+)/);
  if (bag) stageCode = `T${bag[1].padStart(2, "0")}`;
  else if (/1[.,]7\s*inch/.test(s)) stageCode = "S";
  else if (/2[.,]8\s*inch/.test(s)) stageCode = "M";
  else if (/3[.,]5\s*inch/.test(s)) stageCode = "L";
  // Chậu đầy lá (full pot) và chậu 6 inch cũng tính L (Admin cấp cao chốt 22/10/2026).
  else if (/full pot/.test(s) || /(^|[^\d.,])6\s*inch/.test(s)) stageCode = "L";
  else if (/\bnode\b/.test(s)) stageCode = "C";
  else if (/cut/.test(s) && cuttingStage(s)) stageCode = cuttingStage(s);
  else if (/tissue culture/.test(s) || s.trim() === "") stageCode = null;
  else stageMapped = false;
  return { plantCode, stageCode, stageMapped };
}

export type PriceRow = { code: string; name: string; spec: string; prices: (number | null)[] };
export const rowKey = (r: { code: string; spec: string }) => `${r.code.trim().toUpperCase()}|${r.spec.trim().toLowerCase()}`;

// So bảng giá mới với bảng đang áp dụng: cây mới / bị bỏ / đổi giá (so theo nhãn bậc, bậc lệch coi như đổi giá).
export function diffPriceRows(
  oldTiers: string[], oldRows: PriceRow[], newTiers: string[], newRows: PriceRow[]
): { added: PriceRow[]; removed: PriceRow[]; changed: { row: PriceRow; before: (number | null)[] }[] } {
  const oldMap = new Map(oldRows.map((r) => [rowKey(r), r]));
  const newMap = new Map(newRows.map((r) => [rowKey(r), r]));
  const sameTiers = oldTiers.join("|") === newTiers.join("|");
  const added = newRows.filter((r) => !oldMap.has(rowKey(r)));
  const removed = oldRows.filter((r) => !newMap.has(rowKey(r)));
  const changed: { row: PriceRow; before: (number | null)[] }[] = [];
  for (const r of newRows) {
    const o = oldMap.get(rowKey(r));
    if (!o) continue;
    const differ = !sameTiers || r.prices.length !== o.prices.length || r.prices.some((p, i) => (p ?? null) !== (o.prices[i] ?? null));
    if (differ) changed.push({ row: r, before: o.prices });
  }
  return { added, removed, changed };
}
