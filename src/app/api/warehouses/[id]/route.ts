import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Xóa kho (khu sản xuất/kho thành phẩm) — chỉ Admin cấp cao. Xóa mềm (isActive: false), kèm xóa mềm
// luôn mọi phòng + giàn kệ bên trong (client đã hỏi xác nhận kèm cảnh báo số lượng trước khi gọi API
// này — xem AddShelvesDialog cùng thư mục warehouses). Không xóa cứng vì Lot vẫn có thể còn tham chiếu
// tới shelf/room/warehouse này (giữ nguyên lịch sử tồn kho).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được xóa kho" }, { status: 403 });
  }

  const { id } = await params;
  const warehouse = await prisma.warehouse.findUnique({ where: { id } });
  if (!warehouse) return NextResponse.json({ message: "Không tìm thấy kho" }, { status: 404 });

  await prisma.$transaction([
    prisma.shelf.updateMany({ where: { warehouseId: id }, data: { isActive: false } }),
    prisma.room.updateMany({ where: { warehouseId: id }, data: { isActive: false } }),
    prisma.warehouse.update({ where: { id }, data: { isActive: false } }),
  ]);

  return NextResponse.json({ success: true });
}
