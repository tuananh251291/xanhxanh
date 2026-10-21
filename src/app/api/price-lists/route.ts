import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canUploadPriceList, canViewPriceList, getEffectivePriceList, parsePriceListWorkbook } from "@/lib/price-list";
import { addMonthsKey, dateToMonthKey, diffPriceRows, mapPriceCode, monthKeyToDate, monthLabelVi, vnMonthKey } from "@/lib/price-list-shared";

// Tổng quan Bảng giá tháng: từng thị trường — bảng đang áp dụng tháng này, trạng thái bảng tháng sau, các bảng chờ duyệt.
export async function GET() {
  const session = await auth();
  if (!canViewPriceList(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const thisMonth = vnMonthKey();
  const nextMonth = addMonthsKey(thisMonth, 1);
  const markets = await prisma.market.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, currency: true, derivedCurrency: true, invoiceCalcKind: true, priceListEnabled: true },
  });
  const lists = await prisma.priceList.findMany({
    where: { month: { gte: monthKeyToDate(addMonthsKey(thisMonth, -12)) } },
    orderBy: [{ month: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, marketId: true, month: true, currency: true, status: true, fileName: true, createdAt: true, decidedAt: true, rejectionReason: true,
      uploadedBy: { select: { name: true } }, decidedBy: { select: { name: true } }, _count: { select: { items: true } },
    },
  });
  const out = await Promise.all(markets.map(async (m) => {
    const current = await prisma.priceList.findFirst({
      where: { marketId: m.id, status: "APPROVED", month: { lte: monthKeyToDate(thisMonth) } },
      orderBy: [{ month: "desc" }, { decidedAt: "desc" }],
      select: { id: true, month: true, _count: { select: { items: true } } },
    });
    const mine = lists.filter((l) => l.marketId === m.id);
    const next = mine.filter((l) => dateToMonthKey(l.month) === nextMonth);
    return {
      ...m,
      current: current ? { id: current.id, month: dateToMonthKey(current.month), rows: current._count.items } : null,
      nextStatus: next.some((l) => l.status === "APPROVED") ? "APPROVED" : next.some((l) => l.status === "PENDING") ? "PENDING" : next.length ? "REJECTED" : "MISSING",
      lists: mine.map((l) => ({ ...l, month: dateToMonthKey(l.month), rows: l._count.items })),
    };
  }));
  return NextResponse.json({ thisMonth, nextMonth, markets: out });
}

// Tải lên bảng giá Excel cho 1 thị trường + tháng áp dụng → PENDING chờ Admin cấp cao duyệt (thay bảng PENDING cũ cùng
// thị trường + tháng nếu có). Lỗi định dạng thì không lưu gì, trả danh sách lỗi theo dòng.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canUploadPriceList(session.user.role)) {
    return NextResponse.json({ message: "Chỉ NV Trợ lý / Admin cấp cao được tải bảng giá" }, { status: 403 });
  }
  const form = await req.formData();
  const marketId = String(form.get("marketId") ?? "");
  const monthKey = String(form.get("month") ?? "");
  const note = String(form.get("note") ?? "").trim() || null;
  const file = form.get("file");
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return NextResponse.json({ message: "Tháng áp dụng không hợp lệ" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });
  const market = await prisma.market.findUnique({ where: { id: marketId }, select: { id: true, code: true, name: true, currency: true } });
  if (!market) return NextResponse.json({ message: "Không tìm thấy thị trường" }, { status: 400 });

  let parsed;
  try {
    parsed = await parsePriceListWorkbook(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  if (parsed.errors.length > 0) return NextResponse.json({ message: "File có lỗi — sửa rồi tải lại", errors: parsed.errors }, { status: 400 });

  // Đối chiếu mã báo giá → mã cây + quy cách hệ thống.
  const mapped = parsed.rows.map((r) => ({ r, m: mapPriceCode(r.code, r.spec) }));
  const plantCodes = [...new Set(mapped.map((x) => x.m.plantCode).filter((c): c is string => !!c))];
  const plants = new Map((await prisma.plantType.findMany({ where: { code: { in: plantCodes } }, select: { id: true, code: true } })).map((p) => [p.code, p.id]));

  const previous = await getEffectivePriceList(market.id, monthKey);
  const diff = previous
    ? diffPriceRows(previous.tiers, previous.items.map((i) => ({ code: i.code, name: i.name, spec: i.spec, prices: i.prices as (number | null)[] })), parsed.tiers, parsed.rows)
    : null;

  const created = await prisma.$transaction(async (tx) => {
    await tx.priceList.deleteMany({ where: { marketId: market.id, month: monthKeyToDate(monthKey), status: "PENDING" } });
    return tx.priceList.create({
      data: {
        marketId: market.id, month: monthKeyToDate(monthKey), currency: market.currency, tiers: parsed.tiers, status: "PENDING",
        fileName: file.name, note, uploadedById: session.user.id,
        items: {
          create: mapped.map(({ r, m }, i) => ({
            rowNo: i + 1, code: r.code, name: r.name, spec: r.spec, prices: r.prices,
            plantTypeId: m.plantCode ? plants.get(m.plantCode) ?? null : null, stageCode: m.stageCode,
          })),
        },
      },
      select: { id: true },
    });
  }, { timeout: 60000 });

  const unmatched = mapped.filter(({ m }) => !m.plantCode || !plants.has(m.plantCode)).length;
  await createAlert({
    type: "PRICE_LIST_SUBMITTED",
    title: `Bảng giá ${market.name} ${monthLabelVi(monthKey)} chờ duyệt`,
    message: `${session.user.name} tải lên bảng giá ${market.name} (${market.currency}) ${monthLabelVi(monthKey)}: ${parsed.rows.length} dòng${diff ? ` — ${diff.added.length} cây mới, ${diff.removed.length} cây bỏ, ${diff.changed.length} đổi giá` : ""}.`,
    targetRole: "SUPER_ADMIN",
    relatedId: created.id,
    relatedType: "PriceList",
  });
  return NextResponse.json({
    id: created.id, rows: parsed.rows.length, unmatched,
    diff: diff ? { added: diff.added.length, removed: diff.removed.length, changed: diff.changed.length } : null,
  }, { status: 201 });
}
