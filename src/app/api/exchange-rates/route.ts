import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { canEditExchangeRate, canViewExchangeRate, rateCurrencies } from "@/lib/price-list";
import { addMonthsKey, dateToMonthKey, monthKeyToDate, vnMonthKey } from "@/lib/price-list-shared";

// Tỉ giá tháng (NV Kế toán) — GET ?month=yyyy-MM: các đơn vị tiền cần nhập + số đã nhập tháng đó + số tháng trước
// (để so); lịch sử 12 tháng.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canViewExchangeRate(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const qm = searchParams.get("month");
  const month = qm && /^\d{4}-\d{2}$/.test(qm) ? qm : addMonthsKey(vnMonthKey(), 1);
  const currencies = await rateCurrencies();
  const [rows, prevRows, history] = await Promise.all([
    prisma.exchangeRate.findMany({ where: { month: monthKeyToDate(month) }, include: { updatedBy: { select: { name: true } } } }),
    prisma.exchangeRate.findMany({ where: { month: monthKeyToDate(addMonthsKey(month, -1)) } }),
    prisma.exchangeRate.findMany({
      where: { month: { gte: monthKeyToDate(addMonthsKey(month, -12)) } },
      orderBy: [{ month: "desc" }, { currency: "asc" }],
      select: { month: true, currency: true, vndPerUnit: true, perUsd: true },
    }),
  ]);
  return NextResponse.json({
    month, thisMonth: vnMonthKey(), currencies,
    rates: rows.map((r) => ({ currency: r.currency, vndPerUnit: r.vndPerUnit, perUsd: r.perUsd, updatedBy: r.updatedBy.name, updatedAt: r.updatedAt })),
    previous: prevRows.map((r) => ({ currency: r.currency, vndPerUnit: r.vndPerUnit, perUsd: r.perUsd })),
    history: history.map((h) => ({ ...h, month: dateToMonthKey(h.month) })),
  });
}

const putSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rates: z.array(z.object({
    currency: z.string().regex(/^[A-Z]{3}$/),
    vndPerUnit: z.number().positive("Tỉ giá VND phải > 0"),
    perUsd: z.number().positive().nullable().optional(),
  })).min(1),
});

// Lưu tỉ giá 1 tháng (ghi đè số đã nhập của tháng đó).
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canEditExchangeRate(session.user.role)) return NextResponse.json({ message: "Chỉ NV Kế toán / Admin cấp cao được nhập tỉ giá" }, { status: 403 });
  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { month, rates } = parsed.data;
  const date = monthKeyToDate(month);
  await prisma.$transaction(rates.map((r) =>
    prisma.exchangeRate.upsert({
      where: { month_currency: { month: date, currency: r.currency } },
      create: { month: date, currency: r.currency, vndPerUnit: r.vndPerUnit, perUsd: r.currency === "USD" ? 1 : r.perUsd ?? null, updatedById: session.user.id },
      update: { vndPerUnit: r.vndPerUnit, perUsd: r.currency === "USD" ? 1 : r.perUsd ?? null, updatedById: session.user.id },
    })
  ));
  return NextResponse.json({ success: true });
}
