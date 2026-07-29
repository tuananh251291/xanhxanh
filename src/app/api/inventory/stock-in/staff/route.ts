import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { resolveStockInWarehouseId } from "@/lib/stock-in";

// Danh sách NV cấy mô của đúng kho áp dụng (KHO_MO: kho làm việc; Admin/Admin cấp cao: kho tự chọn) —
// dùng cho trang /inventory/nhap-kho khi nhập kho thủ công vào Phòng tối (lô gắn thẳng vào Phòng tối cá
// nhân của đúng NV chọn ở đây, xem getOrCreatePersonalDarkRoom).
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KHO_MO" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Bạn không có quyền dùng chức năng này" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const resolved = await resolveStockInWarehouseId(role, session!.user.workplaceWarehouseId, searchParams.get("warehouseId"));
  if ("error" in resolved) {
    return NextResponse.json({ message: resolved.error }, { status: 400 });
  }

  const staff = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, workplaceWarehouseId: resolved.warehouseId },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(staff);
}
