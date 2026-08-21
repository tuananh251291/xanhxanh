import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import { z } from "zod";

const patchSchema = z.object({
  points: z.number().int().min(0).max(100),
});

// Sửa điểm phục hồi CƠ BẢN của 1 hành vi đã có — cùng quyền tạo mới (canManagePayroll). Không đổi label
// ở đây (đổi tên coi như hành vi khác — dùng "Thêm" tạo mới nếu cần đổi tên, giống /api/violation-types).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const type = await prisma.recoveryBehaviorType.update({ where: { id }, data: { points: parsed.data.points } });
  return NextResponse.json(type);
}

// Xoá mềm — ẩn khỏi danh mục (isActive=false), không xoá hẳn để không ảnh hưởng các dòng
// ComplianceRecoveryPoint đã tham chiếu behaviorTypeId này (points/reason của dòng đó đã lưu riêng, xem
// schema.prisma). Đặt lại đúng label sẽ tự kích hoạt lại (xem POST /api/recovery-behavior-types).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  await prisma.recoveryBehaviorType.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
