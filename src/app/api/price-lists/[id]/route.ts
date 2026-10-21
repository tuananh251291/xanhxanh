import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { createAlert } from "@/lib/inventory";
import { canApprovePriceList, canViewPriceList, getEffectiveRates } from "@/lib/price-list";
import { dateToMonthKey, diffPriceRows, monthLabelVi, type PriceRow } from "@/lib/price-list-shared";

const toRows = (items: { code: string; name: string; spec: string; prices: unknown }[]): PriceRow[] =>
  items.map((i) => ({ code: i.code, name: i.name, spec: i.spec, prices: i.prices as (number | null)[] }));

// Chi tiết 1 bảng giá: các dòng (kèm đối chiếu mã cây hệ thống), so sánh với bảng áp dụng trước đó, và giá đơn vị
// tiền tự tạo (VD Thái Lan USD = giá THB × tỉ giá tháng của NV Kế toán).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canViewPriceList(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  const list = await prisma.priceList.findUnique({
    where: { id },
    include: {
      market: { select: { id: true, code: true, name: true, currency: true, derivedCurrency: true } },
      uploadedBy: { select: { name: true } }, decidedBy: { select: { name: true } },
      items: { orderBy: { rowNo: "asc" }, include: { plantType: { select: { code: true, name: true } } } },
    },
  });
  if (!list) return NextResponse.json({ message: "Không tìm thấy bảng giá" }, { status: 404 });
  const monthKey = dateToMonthKey(list.month);

  // Bảng áp dụng ngay TRƯỚC bảng này (khác bảng này): APPROVED, month <= tháng này, duyệt trước nó.
  const previous = await prisma.priceList.findFirst({
    where: {
      marketId: list.marketId, status: "APPROVED", id: { not: list.id }, month: { lte: list.month },
      ...(list.decidedAt ? { OR: [{ month: { lt: list.month } }, { decidedAt: { lt: list.decidedAt } }] } : {}),
    },
    orderBy: [{ month: "desc" }, { decidedAt: "desc" }],
    include: { items: true },
  });
  const diff = previous ? diffPriceRows(previous.tiers, toRows(previous.items), list.tiers, toRows(list.items)) : null;

  let derived: { currency: string; rate: number | null; note: string } | null = null;
  if (list.market.derivedCurrency) {
    const rates = await getEffectiveRates(monthKey);
    const from = rates.get(list.currency), to = rates.get(list.market.derivedCurrency);
    derived = from && to
      ? { currency: list.market.derivedCurrency, rate: from.vndPerUnit / to.vndPerUnit, note: `1 ${list.currency} = ${from.vndPerUnit} VND, 1 ${to.currency} = ${to.vndPerUnit} VND` }
      : { currency: list.market.derivedCurrency, rate: null, note: `Chưa có tỉ giá ${list.currency}/${list.market.derivedCurrency} cho ${monthLabelVi(monthKey)} — NV Kế toán cần nhập` };
  }

  return NextResponse.json({
    ...list, month: monthKey,
    previous: previous ? { id: previous.id, month: dateToMonthKey(previous.month) } : null,
    diff,
    derived,
  });
}

const decideSchema = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().trim().max(500).optional() });

// Admin cấp cao duyệt / từ chối bảng giá PENDING.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canApprovePriceList(session.user.role)) return NextResponse.json({ message: "Chỉ Admin cấp cao được duyệt bảng giá" }, { status: 403 });
  const parsed = decideSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { id } = await params;
  const { action, reason } = parsed.data;
  const done = await prisma.priceList.updateMany({
    where: { id, status: "PENDING" },
    data: { status: action === "approve" ? "APPROVED" : "REJECTED", decidedById: session.user.id, decidedAt: new Date(), rejectionReason: action === "reject" ? reason || null : null },
  });
  if (done.count === 0) return NextResponse.json({ message: "Bảng giá đã được xử lý trước đó" }, { status: 400 });
  const list = await prisma.priceList.findUniqueOrThrow({ where: { id }, select: { month: true, uploadedById: true, market: { select: { name: true } } } });
  const label = `${list.market.name} ${monthLabelVi(dateToMonthKey(list.month))}`;
  await createAlert({
    type: "PRICE_LIST_DECIDED",
    title: action === "approve" ? `Bảng giá ${label} đã được duyệt` : `Bảng giá ${label} bị từ chối`,
    message: action === "approve" ? `Bảng giá ${label} có hiệu lực từ đầu tháng.` : `Lý do: ${reason || "(không ghi)"} — sửa file rồi tải lên lại.`,
    userId: list.uploadedById,
    relatedId: id,
    relatedType: "PriceList",
  });
  return NextResponse.json({ success: true });
}
