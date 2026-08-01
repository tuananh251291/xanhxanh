import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseInvoiceText, comparePrices } from "@/lib/price-check";
import { PDFParse } from "pdf-parse";

// NV Sale tải invoice PDF lên, hệ thống đọc + đối chiếu với bảng giá đang áp dụng (giá của tháng gần
// nhất không sau tháng hiện tại — xem Product/ProductPrice trong schema.prisma). Không lưu lại kết quả
// kiểm tra vào DB — chỉ trả về ngay cho Sale xem.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SALE") {
    return NextResponse.json({ message: "Chỉ nhân viên bán hàng mới có quyền kiểm tra giá" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu file PDF" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ message: "Chỉ chấp nhận file PDF" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let text: string;
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    text = result.text;
    await parser.destroy();
  } catch {
    return NextResponse.json({ message: "Không đọc được file PDF — vui lòng kiểm tra lại file" }, { status: 400 });
  }

  const parsedInvoice = parseInvoiceText(text);
  if (parsedInvoice.rows.length === 0) {
    return NextResponse.json(
      { message: "Không nhận diện được dòng sản phẩm nào trong file — định dạng invoice này có thể khác mẫu hệ thống đang hỗ trợ" },
      { status: 422 }
    );
  }

  const codes = [...new Set(parsedInvoice.rows.map((r) => r.itemCode))];
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const products = await prisma.product.findMany({
    where: { code: { in: codes } },
    include: {
      prices: { where: { effectiveMonth: { lte: startOfMonth } }, orderBy: { effectiveMonth: "desc" }, take: 1 },
    },
  });

  const priceMap = new Map(
    products.map((p) => [p.code, { productName: p.name, price: p.prices[0]?.price ?? null }])
  );

  const rows = comparePrices(parsedInvoice.rows, priceMap);

  return NextResponse.json({
    invoiceNo: parsedInvoice.invoiceNo,
    invoiceDate: parsedInvoice.invoiceDate,
    rows,
  });
}
