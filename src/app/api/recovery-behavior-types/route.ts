import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().min(1, "Cần nhập tên hành vi"),
  // Điểm phục hồi CƠ BẢN khi có hành vi này — dùng làm gợi ý lúc HR thêm điểm phục hồi (xem
  // /api/payroll/recovery-points). Mặc định 5 nếu không truyền, khớp default ở schema.prisma.
  points: z.number().int().min(0).max(100).optional(),
});

// Danh mục hành vi cộng điểm phục hồi (tab "Cài đặt điểm phục hồi" trong Cài đặt lương) — chỉ HR/Admin
// cấp cao quản lý (canManagePayroll), khác /api/violation-types (KHO_MO cũng thêm được) vì đây là danh
// mục dùng riêng cho tính lương.
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const types = await prisma.recoveryBehaviorType.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
  });
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });

  const existing = await prisma.recoveryBehaviorType.findUnique({ where: { label: parsed.data.label } });
  if (existing) {
    if (!existing.isActive) {
      const reactivated = await prisma.recoveryBehaviorType.update({ where: { id: existing.id }, data: { isActive: true } });
      return NextResponse.json(reactivated);
    }
    return NextResponse.json({ message: "Hành vi này đã có trong danh sách" }, { status: 400 });
  }

  const type = await prisma.recoveryBehaviorType.create({
    data: { label: parsed.data.label, points: parsed.data.points ?? 5, createdById: session!.user!.id },
  });
  return NextResponse.json(type, { status: 201 });
}
