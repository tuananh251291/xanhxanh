import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ATTENDANCE_ROLES, DEFAULT_ANNUAL_LEAVE_DAYS, toAttendanceWorkDate } from "@/lib/attendance";
import { isAttendanceHr } from "@/lib/attendance-server";

// GET ?year= — HCNS xem quỹ phép năm của mọi NV chấm công: tổng / đã dùng (đơn đã duyệt) / đang chờ / còn lại.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceHr(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const year = Number(req.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return NextResponse.json({ message: "Năm không hợp lệ" }, { status: 400 });

  const [staff, balances, requests] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { in: ATTENDANCE_ROLES } },
      select: { id: true, name: true, code: true, role: true, workplaceWarehouse: { select: { name: true } } },
      orderBy: [{ workplaceWarehouseId: "asc" }, { name: "asc" }],
    }),
    prisma.annualLeaveBalance.findMany({ where: { year }, select: { userId: true, totalDays: true } }),
    prisma.attendanceRequest.findMany({
      where: {
        type: "ANNUAL_LEAVE",
        status: { in: ["APPROVED", "PENDING_MANAGER", "PENDING_HR"] },
        startDate: { gte: toAttendanceWorkDate(`${year}-01-01`), lte: toAttendanceWorkDate(`${year}-12-31`) },
      },
      select: { userId: true, status: true, leaveDays: true },
    }),
  ]);
  const totalByUser = new Map(balances.map((b) => [b.userId, b.totalDays]));

  return NextResponse.json({
    year,
    defaultDays: DEFAULT_ANNUAL_LEAVE_DAYS,
    rows: staff.map((s) => {
      const mine = requests.filter((r) => r.userId === s.id);
      const used = mine.filter((r) => r.status === "APPROVED").reduce((sum, r) => sum + r.leaveDays, 0);
      const pending = mine.filter((r) => r.status !== "APPROVED").reduce((sum, r) => sum + r.leaveDays, 0);
      const total = totalByUser.get(s.id) ?? DEFAULT_ANNUAL_LEAVE_DAYS;
      return {
        userId: s.id, name: s.name, code: s.code, role: s.role, warehouseName: s.workplaceWarehouse?.name ?? null,
        total, isCustom: totalByUser.has(s.id), used, pending, remaining: total - used - pending,
      };
    }),
  });
}

const putSchema = z.object({
  userId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  totalDays: z.number().min(0).max(60).multipleOf(0.5, "Số ngày phép phải là bội của 0.5"),
});

// PUT — HCNS chỉnh tổng số ngày phép năm của 1 NV.
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!isAttendanceHr(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { userId, year, totalDays } = parsed.data;
  const saved = await prisma.annualLeaveBalance.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, totalDays },
    update: { totalDays },
  });
  return NextResponse.json(saved);
}
