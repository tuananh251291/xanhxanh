import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseInvoiceText } from "@/lib/price-check";
import { getEffectivePriceList, getEffectiveRates } from "@/lib/price-list";
import { mapPriceCode, vnMonthKey } from "@/lib/price-list-shared";
import { lookupPrice, roundCur } from "@/lib/invoice-engine";
import { PDFParse } from "pdf-parse";

// NV Sale tải invoice PDF (mẫu xuất khẩu cũ) lên, chọn thị trường — hệ thống đọc + đối chiếu với Bảng giá tháng
// đang áp dụng của thị trường đó (tháng hiện tại, giờ VN). Mã invoice "PD19T10" → mã cây PD019 + quy cách T10;
// dòng bảng giá cùng mã cây đúng quy cách (hoặc "Tissue culture" = mọi loại túi) — giá theo bậc tổng số lượng mã đó.
// Không lưu kết quả vào DB.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE" && session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ nhân viên bán hàng mới có quyền kiểm tra giá" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const marketId = String(formData.get("marketId") ?? "");
  const wantCurrency = String(formData.get("currency") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file PDF" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ message: "Chỉ chấp nhận file PDF" }, { status: 400 });
  const market = await prisma.market.findUnique({ where: { id: marketId }, select: { id: true, name: true, currency: true, derivedCurrency: true } });
  if (!market) return NextResponse.json({ message: "Chọn thị trường" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    const parser = new PDFParse({ data: buffer });
    text = (await parser.getText()).text;
    await parser.destroy();
  } catch {
    return NextResponse.json({ message: "Không đọc được file PDF — vui lòng kiểm tra lại file" }, { status: 400 });
  }

  const parsedInvoice = parseInvoiceText(text);
  if (parsedInvoice.rows.length === 0) {
    return NextResponse.json(
      { message: "Không nhận diện được dòng sản phẩm nào trong file — định dạng phiếu báo giá này có thể khác mẫu hệ thống đang hỗ trợ" },
      { status: 422 }
    );
  }

  const monthKey = vnMonthKey();
  const list = await getEffectivePriceList(market.id, monthKey);
  if (!list) return NextResponse.json({ message: `Thị trường ${market.name} chưa có bảng giá đã duyệt` }, { status: 400 });

  // Đơn vị tiền so sánh: gốc của bảng giá, hoặc đơn vị tự tạo (VD Thái Lan USD) đổi qua tỉ giá VND của tháng.
  const currency = wantCurrency && wantCurrency === market.derivedCurrency ? wantCurrency : list.currency;
  let fx = 1;
  if (currency !== list.currency) {
    const rates = await getEffectiveRates(monthKey);
    const a = rates.get(list.currency), b = rates.get(currency);
    if (!a || !b) return NextResponse.json({ message: `Chưa có tỉ giá ${list.currency}/${currency} — NV Kế toán cần nhập Tỉ giá tháng` }, { status: 400 });
    fx = a.vndPerUnit / b.vndPerUnit;
  }

  const items = list.items.map((i) => ({ ...i, prices: i.prices as (number | null)[], map: mapPriceCode(i.code, i.spec) }));
  const qtyByCode = new Map<string, number>();
  for (const r of parsedInvoice.rows) qtyByCode.set(r.itemCode, (qtyByCode.get(r.itemCode) ?? 0) + r.quantity);

  const rows = parsedInvoice.rows.map((row) => {
    const m = row.itemCode.match(/^([A-Z]{2})(\d{1,3})(T\d{2})$/);
    const plantCode = m ? `${m[1]}${m[2].padStart(3, "0")}` : null;
    const stage = m?.[3] ?? null;
    const cands = items.filter((i) => i.map.plantCode === plantCode);
    const hit = cands.find((i) => i.map.stageCode === stage) ?? cands.find((i) => i.map.stageCode == null);
    if (!hit) return { ...row, status: "NOT_IN_PRICE_LIST" as const, currentPrice: null, productName: null, tier: null };
    const lp = lookupPrice(list.tiers, hit.prices, qtyByCode.get(row.itemCode) ?? row.quantity);
    if (lp.err) return { ...row, status: "NO_PRICE_YET" as const, currentPrice: null, productName: hit.name, tier: lp.err === "notier" ? lp.tier : `dưới tối thiểu ${lp.moq}` };
    const price = roundCur(lp.price * fx, currency);
    return {
      ...row, productName: hit.name, currentPrice: price, tier: lp.tier,
      status: Math.abs(price - row.unitPrice) < 0.005 ? ("OK" as const) : ("PRICE_MISMATCH" as const),
    };
  });

  return NextResponse.json({
    invoiceNo: parsedInvoice.invoiceNo,
    invoiceDate: parsedInvoice.invoiceDate,
    currency, priceListMonth: list.month.toISOString().slice(0, 7),
    rows,
  });
}
