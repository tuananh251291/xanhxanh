// Đọc invoice PDF xuất khẩu (mẫu XANH XANH URBAN FOREST) và đối chiếu với bảng giá sản phẩm đang áp
// dụng (xem POST /api/price-check). Regex được tinh chỉnh theo đúng layout cột của mẫu invoice này —
// "No | Item code | Model name | Description | Botanical name | Unit | Quantity | Unit Price | Total |
// Note" (xem file mẫu XXIDPEF2505). Nếu sau này có invoice layout khác không đọc được, cần mở rộng regex
// ROW_RE hoặc thêm mẫu khác — không tự đoán khi không chắc chắn, luôn để rows rỗng để báo lỗi rõ ràng
// thay vì trả kết quả sai.

export type ParsedInvoiceRow = {
  no: string;
  itemCode: string;
  modelName: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type ParsedInvoice = {
  invoiceNo: string | null;
  invoiceDate: string | null;
  rows: ParsedInvoiceRow[];
};

// Số theo định dạng Châu Âu trên invoice: dấu chấm = phân cách nghìn, dấu phẩy = phân cách thập phân
// (VD "3.250" = 3250, "0,59" = 0.59, "11.527,00" = 11527.00).
function parseEuroNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

// Mã sản phẩm dạng "PD19T10" (2 chữ cái + 2 số + T + 2 số). Neo đầu dòng để tách từng sản phẩm; phần
// numeric cuối (Quantity, Unit Price, Total) neo bằng 3 số liên tiếp đúng định dạng ngay sau cột Unit —
// tránh nhầm với số lượng nằm giữa mô tả (VD "bag of 10 pcs").
const ROW_RE =
  /(\d+)\s+([A-Z]{2}\d{2}T\d{2})\s+([\s\S]*?)\s+(\S+)\s+(\d[\d.]*)\s+(\d+,\d{2})\s+([\d.]+,\d{2})/g;

export function parseInvoiceText(text: string): ParsedInvoice {
  const invoiceNoMatch = text.match(/Invoice No\.?\s*:?\s*(\S+)/i);
  const invoiceDateMatch = text.match(/Date:\s*(\d{2}\/\d{2}\/\d{4})/);

  const rows: ParsedInvoiceRow[] = [];
  const re = new RegExp(ROW_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const middle = m[3].replace(/\s+/g, " ").trim();
    const modelName = middle.split(/\s+Tissue culture/i)[0].trim();
    rows.push({
      no: m[1],
      itemCode: m[2].toUpperCase(),
      modelName,
      quantity: parseEuroNumber(m[5]),
      unitPrice: parseEuroNumber(m[6]),
      total: parseEuroNumber(m[7]),
    });
  }

  return {
    invoiceNo: invoiceNoMatch?.[1] ?? null,
    invoiceDate: invoiceDateMatch?.[1] ?? null,
    rows,
  };
}

export type PriceCheckStatus = "OK" | "PRICE_MISMATCH" | "NOT_IN_PRICE_LIST" | "NO_PRICE_YET";

export type PriceCheckRow = ParsedInvoiceRow & {
  status: PriceCheckStatus;
  currentPrice: number | null;
  productName: string | null;
};

// Sai số làm tròn cho phép khi so giá (USD, 2 chữ số thập phân trên invoice).
const PRICE_EPSILON = 0.005;

export function comparePrices(
  rows: ParsedInvoiceRow[],
  currentPrices: Map<string, { productName: string; price: number | null }>
): PriceCheckRow[] {
  return rows.map((row) => {
    const entry = currentPrices.get(row.itemCode);
    if (!entry) {
      return { ...row, status: "NOT_IN_PRICE_LIST", currentPrice: null, productName: null };
    }
    if (entry.price === null) {
      return { ...row, status: "NO_PRICE_YET", currentPrice: null, productName: entry.productName };
    }
    const status: PriceCheckStatus =
      Math.abs(entry.price - row.unitPrice) <= PRICE_EPSILON ? "OK" : "PRICE_MISMATCH";
    return { ...row, status, currentPrice: entry.price, productName: entry.productName };
  });
}
