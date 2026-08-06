import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sumLotQuantity } from "@/types";
import { shelfMatchesPlantType, isEligibleMotherShelfForStockIn, resolveStockInWarehouseId, STOCK_IN_ROOM_TYPE } from "@/lib/stock-in";

// Danh sách kệ trong kho áp dụng (KHO_MO: đúng kho làm việc; Admin/Admin cấp cao: kho tự chọn qua query
// warehouseId), được phép xếp mã cây đã chọn — dùng cho trang /inventory/nhap-kho chọn kệ khi nhập kho
// thủ công. Trả về cả kệ đã đầy (full=true) thay vì lọc bỏ, để NV biết kệ đó tồn tại nhưng đang hết chỗ
// thay vì tưởng nhầm mã cây không được xếp vào đâu cả.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KHO_MO" && role !== "ADMIN" && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Bạn không có quyền dùng chức năng này" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const plantTypeId = searchParams.get("plantTypeId");
  if (stage !== "MAU_ME" && stage !== "THANH_PHAM") {
    return NextResponse.json({ message: "Loại tồn không hợp lệ" }, { status: 400 });
  }
  if (!plantTypeId) {
    return NextResponse.json({ message: "Thiếu mã cây" }, { status: 400 });
  }

  const resolved = await resolveStockInWarehouseId(role, session!.user.workplaceWarehouseId, searchParams.get("warehouseId"));
  if ("error" in resolved) {
    return NextResponse.json({ message: resolved.error }, { status: 400 });
  }

  const plantType = await prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { code: true, isActive: true } });
  if (!plantType || !plantType.isActive) {
    return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  }

  const shelves = await prisma.shelf.findMany({
    where: { warehouseId: resolved.warehouseId, isActive: true, room: { type: STOCK_IN_ROOM_TYPE[stage] } },
    select: {
      id: true,
      code: true,
      name: true,
      block: true,
      capacity: true,
      plantTypeId: true,
      allowedCodes: true,
      assignedStaffId: true,
      lots: { where: { status: "ACTIVE" }, select: { quantity: true, plantTypeId: true } },
    },
    orderBy: [{ block: "asc" }, { colNumber: "asc" }],
  });

  // Phòng mẫu mẹ dùng bộ lọc riêng theo TỒN THỰC TẾ (xem isEligibleMotherShelfForStockIn) — Phòng ra rễ
  // giữ nguyên shelfMatchesPlantType (không ràng buộc mã cây).
  const eligible = shelves
    .filter((s) => (stage === "MAU_ME" ? isEligibleMotherShelfForStockIn(s, plantTypeId, plantType.code) : shelfMatchesPlantType(stage, s, plantTypeId, plantType.code)))
    .map((s) => {
      const used = sumLotQuantity(s.lots);
      const capLeft = s.capacity === null ? null : Math.max(0, s.capacity - used);
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        capacity: s.capacity,
        used,
        capLeft,
        full: capLeft !== null && capLeft <= 0,
      };
    });

  return NextResponse.json(eligible);
}
