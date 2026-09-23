import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Danh sách NV cấy mô thuộc khu sản xuất R&D (User.workplaceWarehouseId = Kho SX R&D) — dùng cho ô
// "Giao cho" khi Admin kỹ thuật tạo chỉ định cấy R&D (xem CreateInstructionDialog, rnd-production-board.tsx
// + POST /api/rnd-production/instructions). Admin kỹ thuật vẫn luôn tự giao được cho chính mình (mặc
// định, không cần chọn) — đây chỉ là các lựa chọn THÊM cho NV cấy mô thật đã được gán làm việc tại đây
// (qua trang Người dùng, canAssignWorkplace) — chưa có NV nào thì trả mảng rỗng, không phải lỗi.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const rndWarehouse = await prisma.warehouse.findFirst({ where: { isRnd: true }, select: { id: true } });
  if (!rndWarehouse) return NextResponse.json([]);

  const staff = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, workplaceWarehouseId: rndWarehouse.id },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(staff);
}
