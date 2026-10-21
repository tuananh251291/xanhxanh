import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { cellText } from "@/lib/excel-import";
import { TIER_RE, monthKeyToDate, type PriceRow } from "@/lib/price-list-shared";

// Bảng giá tháng theo thị trường (PriceList) — thay "Bảng giá sản phẩm" + báo giá PDF của Invoice Desk.
// NV Trợ lý / Admin cấp cao tải Excel (mỗi thị trường 1 file), Admin cấp cao duyệt. Xem prisma/schema.prisma.

export const canUploadPriceList = (role: string | null | undefined) => role === "TRO_LY" || role === "SUPER_ADMIN";
export const canApprovePriceList = (role: string | null | undefined) => role === "SUPER_ADMIN";
export const canViewPriceList = (role: string | null | undefined) =>
  canUploadPriceList(role) || role === "ADMIN" || role === "KE_TOAN" || role === "SALE";
export const canEditExchangeRate = (role: string | null | undefined) => role === "KE_TOAN" || role === "SUPER_ADMIN";
export const canViewExchangeRate = (role: string | null | undefined) => canEditExchangeRate(role) || role === "ADMIN" || role === "TRO_LY";

// Bảng giá đang áp dụng cho 1 tháng = bảng APPROVED có month lớn nhất <= tháng đó (cùng tháng thì bảng duyệt sau cùng).
export async function getEffectivePriceList(marketId: string, monthKey: string) {
  return prisma.priceList.findFirst({
    where: { marketId, status: "APPROVED", month: { lte: monthKeyToDate(monthKey) } },
    orderBy: [{ month: "desc" }, { decidedAt: "desc" }],
    include: { items: { orderBy: { rowNo: "asc" } } },
  });
}

// Tỉ giá đang áp dụng cho 1 tháng (bản mới nhất có month <= tháng đó) theo từng đơn vị tiền.
export async function getEffectiveRates(monthKey: string) {
  const rows = await prisma.exchangeRate.findMany({
    where: { month: { lte: monthKeyToDate(monthKey) } },
    orderBy: { month: "desc" },
  });
  const map = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!map.has(r.currency)) map.set(r.currency, r);
  return map;
}

// Danh sách đơn vị tiền NV Kế toán cần nhập tỉ giá: mọi đơn vị tiền của thị trường đang hoạt động + USD.
export async function rateCurrencies(): Promise<string[]> {
  const markets = await prisma.market.findMany({ where: { isActive: true }, select: { currency: true, derivedCurrency: true } });
  const set = new Set<string>(["USD"]);
  for (const m of markets) { set.add(m.currency); if (m.derivedCurrency) set.add(m.derivedCurrency); }
  return [...set].sort((a, b) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));
}

// Đọc file Excel bảng giá: sheet "Bảng giá" (hoặc sheet đầu), dòng 1 = tiêu đề "Mã | Tên cây | Quy cách | <bậc>…",
// từ dòng 2 là dữ liệu. Ô giá trống = không bán ở bậc đó.
export async function parsePriceListWorkbook(buffer: ArrayBuffer): Promise<{ tiers: string[]; rows: PriceRow[]; errors: { row: number; message: string }[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as never);
  const sheet = wb.getWorksheet("Bảng giá") ?? wb.worksheets[0];
  const errors: { row: number; message: string }[] = [];
  if (!sheet) return { tiers: [], rows: [], errors: [{ row: 0, message: "File không có sheet dữ liệu" }] };

  const header = sheet.getRow(1);
  const tiers: string[] = [];
  const tierCols: number[] = [];
  for (let c = 4; c <= Math.max(header.cellCount, 4); c++) {
    const t = cellText(header.getCell(c).value).replace(/\s+/g, "");
    if (!t) continue;
    if (!TIER_RE.test(t)) { errors.push({ row: 1, message: `Cột ${c}: tiêu đề bậc "${t}" không hợp lệ (VD 5-9, 10-19, 200+)` }); continue; }
    tiers.push(t);
    tierCols.push(c);
  }
  if (tiers.length === 0) errors.push({ row: 1, message: "Không có cột bậc số lượng nào (từ cột D, VD 5-9, 10-19…)" });

  const rows: PriceRow[] = [];
  const seen = new Set<string>();
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const code = cellText(row.getCell(1).value).trim();
    const name = cellText(row.getCell(2).value).trim();
    const spec = cellText(row.getCell(3).value).trim();
    const prices: (number | null)[] = tierCols.map((c) => {
      const v = row.getCell(c).value;
      const t = cellText(v).trim();
      if (t === "") return null;
      const num = typeof v === "number" ? v : Number(t.replace(/\s/g, "").replace(/,/g, ""));
      if (!Number.isFinite(num) || num < 0) { errors.push({ row: n, message: `${code || "?"}: giá "${t}" không hợp lệ` }); return null; }
      return num;
    });
    if (!code && !name && prices.every((p) => p == null)) return;
    if (!code) { errors.push({ row: n, message: "Thiếu Mã" }); return; }
    const key = `${code.toUpperCase()}|${spec.toLowerCase()}`;
    if (seen.has(key)) { errors.push({ row: n, message: `${code}: trùng Mã + Quy cách với dòng khác` }); return; }
    seen.add(key);
    if (prices.every((p) => p == null)) errors.push({ row: n, message: `${code}: chưa có giá ở bậc nào` });
    rows.push({ code, name, spec, prices });
  });
  if (rows.length === 0 && errors.length === 0) errors.push({ row: 0, message: "File không có dòng dữ liệu nào" });
  return { tiers, rows, errors };
}

// File mẫu Excel — điền sẵn bảng giá đang áp dụng (nếu có) để NV Trợ lý chỉ cần sửa giá.
export async function buildPriceListTemplate(params: { marketName: string; currency: string; tiers: string[]; rows: PriceRow[] }) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Bảng giá");
  const tiers = params.tiers.length ? params.tiers : ["5-9", "10-19", "20-49", "50-99", "100-299", "300-499", "500-999", "1000-4999", "5000+"];
  sheet.columns = [
    { header: "Mã", width: 14 }, { header: "Tên cây", width: 40 }, { header: "Quy cách", width: 30 },
    ...tiers.map((t) => ({ header: t, width: 11 })),
  ];
  const head = sheet.getRow(1);
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4EA" } }; });
  for (const r of params.rows) sheet.addRow([r.code, r.name, r.spec, ...tiers.map((_, i) => r.prices[i] ?? null)]);
  sheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  const guide = wb.addWorksheet("Hướng dẫn");
  guide.getColumn(1).width = 120;
  for (const line of [
    `Bảng giá ${params.marketName} — đơn vị tiền ${params.currency}, giá/cây.`,
    "Dòng 1: Mã | Tên cây | Quy cách | các cột bậc số lượng (VD 5-9, 10-19, 200+). Có thể thêm/bớt/đổi cột bậc.",
    "Mã: mã cây theo báo giá (VD AL62, MT001T10) — hệ thống tự đối chiếu sang mã cây hệ thống (AL62 → AL062).",
    "Quy cách: Tissue culture (TC, mọi loại túi) / Tissue bag 10 plant / Tissue bag 1 plant / Size pot 1.7 inch (→ chậu S) / Size pot 2.8 inch (→ chậu M)…",
    "Ô giá để trống = không bán ở bậc đó. Số thập phân dùng dấu chấm (VD 12.5), không dùng dấu chấm ngăn cách hàng nghìn.",
    "Tải lên xong, bảng giá chờ Admin cấp cao duyệt mới có hiệu lực từ đầu tháng áp dụng.",
  ]) guide.addRow([line]);
  return wb.xlsx.writeBuffer();
}
