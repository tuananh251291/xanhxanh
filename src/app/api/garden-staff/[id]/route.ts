import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageGarden } from "@/lib/garden-staff";
import { gardenStaffSchema } from "@/lib/garden-staff-constants";

async function loadEditable(id: string, user: Parameters<typeof canManageGarden>[0]) {
  const staff = await prisma.gardenStaff.findUnique({ where: { id }, select: { gardenId: true, isActive: true } });
  if (!staff || !staff.isActive) return { error: NextResponse.json({ message: "Không tìm thấy nhân viên" }, { status: 404 }) };
  if (!(await canManageGarden(user, staff.gardenId))) return { error: NextResponse.json({ message: "Không có quyền" }, { status: 403 }) };
  return { staff };
}

// Sửa thông tin + vị trí của 1 nhân sự vườn.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const check = await loadEditable(id, session.user);
  if (check.error) return check.error;

  const parsed = gardenStaffSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { name, phone, types, notes } = parsed.data;

  const updated = await prisma.gardenStaff.update({
    where: { id },
    data: { name, phone: phone || null, notes: notes || null, types: [...new Set(types)] },
    select: { id: true, name: true, phone: true, types: true, notes: true, createdAt: true },
  });
  return NextResponse.json(updated);
}

// Xoá = ẩn khỏi danh sách (isActive=false), giữ bản ghi cho lịch sử phân công sau này.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const check = await loadEditable(id, session.user);
  if (check.error) return check.error;

  await prisma.gardenStaff.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
