import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const patchSchema = z.object({
  points: z.number().int().min(0).max(100).optional(),
  // Nhóm lỗi — nhập tự do, "" = gỡ khỏi nhóm (coi như "Chưa phân nhóm"). Xem ViolationType.groupName.
  groupName: z.string().trim().max(100).optional(),
});

// Sửa điểm trừ CƠ BẢN và/hoặc nhóm lỗi của 1 loại lỗi vi phạm đã có — cùng quyền tạo mới (Admin/Admin
// cấp cao/Kho mô). Không đổi label ở đây (đổi tên coi như loại lỗi khác — dùng "Thêm" tạo mới nếu cần
// đổi tên).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  if (!isAdminRole(role) && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  if (parsed.data.points === undefined && parsed.data.groupName === undefined) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  const type = await prisma.violationType.update({
    where: { id },
    data: {
      ...(parsed.data.points !== undefined ? { points: parsed.data.points } : {}),
      ...(parsed.data.groupName !== undefined ? { groupName: parsed.data.groupName || null } : {}),
    },
  });
  return NextResponse.json(type);
}
