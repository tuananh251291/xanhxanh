import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildPriceListTemplate, canViewPriceList, getEffectivePriceList } from "@/lib/price-list";
import { vnMonthKey } from "@/lib/price-list-shared";

// File mẫu Excel bảng giá của 1 thị trường — điền sẵn bảng đang áp dụng cho tháng chọn (để chỉ cần sửa giá).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canViewPriceList(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const marketId = searchParams.get("marketId") ?? "";
  const month = searchParams.get("month") ?? vnMonthKey();
  const market = await prisma.market.findUnique({ where: { id: marketId }, select: { id: true, code: true, name: true, currency: true } });
  if (!market) return NextResponse.json({ message: "Không tìm thấy thị trường" }, { status: 404 });
  const current = await getEffectivePriceList(market.id, /^\d{4}-\d{2}$/.test(month) ? month : vnMonthKey());
  const buf = await buildPriceListTemplate({
    marketName: market.name,
    currency: market.currency,
    tiers: current?.tiers ?? [],
    rows: (current?.items ?? []).map((i) => ({ code: i.code, name: i.name, spec: i.spec, prices: i.prices as (number | null)[] })),
  });
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bang-gia-${market.code}-${month}.xlsx"`,
    },
  });
}
