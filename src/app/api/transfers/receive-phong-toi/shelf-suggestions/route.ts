import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Danh sách mã kệ Phòng mẫu mẹ thuộc đúng kho KHO_MO đang làm việc — dùng để gợi ý (autocomplete) khi
// tự nhập kệ tay ở bước "Không theo nguyên tắc" (xem ManualPlacementForm trong place-board.tsx/
// place-staff-board.tsx). Trả về TOÀN BỘ kệ đang hoạt động của phòng, KHÔNG lọc theo mã cây/sức chứa
// như /api/inventory/stock-in/shelves — vì đây là lối tắt cho trường hợp phát sinh, không nên áp lại
// đúng những ràng buộc mà NV đang cố tình bỏ qua khi chọn "tự nhập".
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc" }, { status: 400 });

  const shelves = await prisma.shelf.findMany({
    where: { warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
    select: { code: true },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(shelves.map((s) => s.code));
}
