import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import CreateWarehouseDialog from "./create-warehouse-dialog";
import WarehouseBoard from "./warehouse-board";

const shelfInclude = {
  where: { isActive: true },
  include: {
    plantType: { select: { id: true, code: true, name: true } },
    assignedStaff: { select: { id: true, code: true, name: true } },
    lots: { where: { status: "ACTIVE" as const }, select: { quantity: true, stageCode: true } },
  },
  orderBy: [{ rowNumber: "asc" as const }, { colNumber: "asc" as const }],
};

export default async function WarehousesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/warehouses"))) redirect("/dashboard");

  const [warehouses, saleUsers, caymoStaff] = await Promise.all([
    prisma.warehouse.findMany({
      include: {
        rooms: {
          where: { isActive: true },
          orderBy: { type: "asc" },
          include: {
            shelves: shelfInclude,
            roomAccess: { select: { userId: true } },
          },
        },
        shelves: { ...shelfInclude, where: { isActive: true, roomId: null } },
      },
      orderBy: { type: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "SALE", isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "CAY_MO", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const canManageStaffAndPlant = session?.user?.role === "SUPER_ADMIN";
  const canMoveRoom = isAdminRole(session?.user?.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kho & Giàn kệ</h1>
          <p className="text-gray-500 text-sm mt-1">{warehouses.length} kho — bấm vào từng kho để xem phòng, bấm vào từng phòng để xem chi tiết giàn kệ</p>
        </div>
        <CreateWarehouseDialog />
      </div>

      <WarehouseBoard
        warehouses={warehouses}
        saleUsers={saleUsers}
        caymoStaff={caymoStaff}
        canManageStaffAndPlant={canManageStaffAndPlant}
        canMoveRoom={canMoveRoom}
      />
    </div>
  );
}
