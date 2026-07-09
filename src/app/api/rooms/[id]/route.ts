import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Xóa phòng — chỉ Admin cấp cao. Xóa mềm (isActive: false), kèm xóa mềm luôn mọi giàn kệ bên trong.
// Client đã hỏi xác nhận kèm cảnh báo số lượng kệ/lô cây trước khi gọi API này.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được xóa phòng" }, { status: 403 });
  }

  const { id } = await params;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ message: "Không tìm thấy phòng" }, { status: 404 });

  await prisma.$transaction([
    prisma.shelf.updateMany({ where: { roomId: id }, data: { isActive: false } }),
    prisma.room.update({ where: { id }, data: { isActive: false } }),
  ]);

  return NextResponse.json({ success: true });
}
