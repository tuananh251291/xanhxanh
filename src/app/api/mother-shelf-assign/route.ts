import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { sumLotQuantity } from "@/types";

// Danh sách giàn kệ Phòng mẫu mẹ của ĐÚNG kho làm việc (workplaceWarehouseId) của NV kho mô, kèm danh mục
// mã cây + NV cấy mô để chọn gán — dùng cho trang "Gán mã cây & nhân viên cho giàn mẫu mẹ". Không phân
// trang (giống hệt /api/mother-stock-reshelf đã fetch toàn bộ kệ 1 lần), lọc/tìm kiếm thực hiện ở client.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ shelves: [], plantTypes: [], staff: [] });

  const [shelves, plantTypes, staff] = await Promise.all([
    prisma.shelf.findMany({
      where: { warehouseId: workplaceWarehouseId, isActive: true, room: { type: "PHONG_MAU_ME" } },
      select: {
        id: true,
        code: true,
        name: true,
        capacity: true,
        plantType: { select: { id: true, code: true, name: true } },
        assignedStaff: { select: { id: true, code: true, name: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.plantType.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    // Chỉ gợi ý NV cấy mô chưa gán kho làm việc nào, hoặc đã gán ĐÚNG kho này — khớp ràng buộc thật sự
    // được kiểm tra ở resolveShelfAttributeUpdate (chặn gán NV thuộc kho khác), tránh NV kho mô chọn
    // xong mới bị báo lỗi.
    prisma.user.findMany({
      where: { role: "CAY_MO", isActive: true, OR: [{ workplaceWarehouseId: null }, { workplaceWarehouseId }] },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return NextResponse.json({
    shelves: shelves.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      capacity: s.capacity,
      used: sumLotQuantity(s.lots),
      plantType: s.plantType,
      assignedStaff: s.assignedStaff,
    })),
    plantTypes,
    staff,
  });
}
