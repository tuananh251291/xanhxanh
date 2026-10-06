import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ATTENDANCE_ROLES } from "@/lib/attendance";
import { isAttendanceHr } from "@/lib/attendance-server";

// GET — HCNS: danh sách khu có NV chấm công (theo User.workplaceWarehouseId) kèm cài đặt chấm công và danh
// sách người có thể chọn làm người duyệt cấp 1 (NV đang làm ở khu đó).
export async function GET() {
  const session = await auth();
  if (!isAttendanceHr(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, staff: { some: { isActive: true, role: { in: ATTENDANCE_ROLES } } } },
    select: {
      id: true, name: true, type: true,
      attendanceSite: { include: { approver: { select: { id: true, name: true } } } },
      staff: {
        where: { isActive: true },
        select: { id: true, name: true, code: true, role: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    sites: warehouses.map((w) => ({
      warehouseId: w.id,
      warehouseName: w.name,
      warehouseType: w.type,
      staffCount: w.staff.filter((s) => s.role && ATTENDANCE_ROLES.includes(s.role)).length,
      candidates: w.staff,
      site: w.attendanceSite,
    })),
  });
}
