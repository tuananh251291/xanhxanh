import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { startOfDay } from "date-fns";
import { z } from "zod";

const createSchema = z.object({
  date: z.string().min(1),
  description: z.string().trim().min(1, "Cần nhập nội dung ngày nghỉ"),
  isPaid: z.boolean(),
});

// "Danh sách ngày nghỉ lễ" — trừ khỏi Ngày công tiêu chuẩn (mọi ngày, không phân biệt isPaid); isPaid
// đúng thì CỘNG thêm vào Ngày công hưởng lương (xem src/lib/payroll-calculation.ts).
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const holidays = await prisma.publicHoliday.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json(holidays);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const date = new Date(parsed.data.date);
  if (Number.isNaN(date.getTime())) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });

  const existing = await prisma.publicHoliday.findUnique({ where: { date: startOfDay(date) } });
  if (existing) return NextResponse.json({ message: "Ngày này đã có trong danh sách" }, { status: 400 });

  const holiday = await prisma.publicHoliday.create({
    data: { date: startOfDay(date), description: parsed.data.description, isPaid: parsed.data.isPaid, createdById: session!.user!.id },
  });
  return NextResponse.json(holiday, { status: 201 });
}
