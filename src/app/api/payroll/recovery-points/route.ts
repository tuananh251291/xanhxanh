import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  staffId: z.string().min(1),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Kỳ phải theo dạng yyyy-MM"),
  points: z.number().int(),
  reason: z.string().trim().min(1, "Cần nhập lý do"),
  // Hành vi chọn từ danh mục lúc thêm (tuỳ chọn, xem RecoveryBehaviorType) — chỉ để truy vết, không bắt
  // buộc (vẫn nhập tay tự do được).
  behaviorTypeId: z.string().optional(),
});

// "Điểm phục hồi" — HR tự nhập tay cho 1 NV cấy mô, 1 kỳ lương cụ thể, CỘNG vào điểm tuân thủ cuối kỳ
// (xem src/lib/payroll-calculation.ts). Không có cơ chế tự sinh.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const periodMonth = req.nextUrl.searchParams.get("periodMonth")?.trim() || undefined;

  const rows = await prisma.complianceRecoveryPoint.findMany({
    where: { ...(periodMonth ? { periodMonth } : {}) },
    include: { staff: { select: { code: true, name: true } } },
    orderBy: [{ periodMonth: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const staff = await prisma.user.findUnique({ where: { id: parsed.data.staffId }, select: { role: true } });
  if (!staff || staff.role !== "CAY_MO") return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });

  const row = await prisma.complianceRecoveryPoint.create({
    data: { ...parsed.data, createdById: session!.user!.id },
    include: { staff: { select: { code: true, name: true } } },
  });
  return NextResponse.json(row, { status: 201 });
}
