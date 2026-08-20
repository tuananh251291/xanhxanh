import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Kỳ phải theo dạng yyyy-MM"),
  maxAmount: z.number().int().min(0),
});

// "Mức thưởng KPI" — mức thưởng KPI tuân thủ TỐI ĐA, áp dụng từ đúng kỳ lương periodMonth trở đi (tới
// khi có dòng periodMonth mới hơn) — xem resolveKpiBonusRate ở src/lib/payroll-calculation.ts.
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const rates = await prisma.kpiBonusRate.findMany({
    include: { createdBy: { select: { name: true } } },
    orderBy: { periodMonth: "desc" },
  });
  return NextResponse.json(rates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const rate = await prisma.kpiBonusRate.upsert({
    where: { periodMonth: parsed.data.periodMonth },
    update: { maxAmount: parsed.data.maxAmount },
    create: { periodMonth: parsed.data.periodMonth, maxAmount: parsed.data.maxAmount, createdById: session!.user!.id },
  });
  return NextResponse.json(rate, { status: 201 });
}
