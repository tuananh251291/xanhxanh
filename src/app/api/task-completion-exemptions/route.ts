import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";
import { startOfDay, parseISO, isValid } from "date-fns";

// Chỉ Admin miễn trừ được — dùng khi NV có lý do chính đáng (nghỉ phép, ốm...) nên 1 ngày cụ thể không
// tính vào báo cáo "Số ngày không hoàn thành nhiệm vụ" dù thực tế hôm đó chưa hoàn thành (xem
// src/lib/task-completion-report.ts).
const createSchema = z.object({
  staffId: z.string().min(1),
  date: z.string().min(1),
  reason: z.string().trim().min(1, "Cần nhập lý do"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const date = parseISO(parsed.data.date);
  if (!isValid(date)) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });

  const exemption = await prisma.taskCompletionExemption.upsert({
    where: { staffId_date: { staffId: parsed.data.staffId, date: startOfDay(date) } },
    update: { reason: parsed.data.reason, createdById: session!.user!.id },
    create: {
      staffId: parsed.data.staffId, date: startOfDay(date), reason: parsed.data.reason, createdById: session!.user!.id,
    },
  });

  return NextResponse.json(exemption, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const staffId = searchParams.get("staffId");
  const dateParam = searchParams.get("date");
  if (!staffId || !dateParam) return NextResponse.json({ message: "Thiếu staffId/date" }, { status: 400 });
  const date = parseISO(dateParam);
  if (!isValid(date)) return NextResponse.json({ message: "Ngày không hợp lệ" }, { status: 400 });

  await prisma.taskCompletionExemption.deleteMany({ where: { staffId, date: startOfDay(date) } });
  return NextResponse.json({ ok: true });
}
