import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";
import CreateWarehouseDialog from "./create-warehouse-dialog";
import WarehouseBoard from "./warehouse-board";

const shelfInclude = {
  where: { isActive: true },
  include: {
    plantType: { select: { id: true, code: true, name: true } },
    assignedStaff: { select: { id: true, code: true, name: true } },
    rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
    lots: {
      // quantity > 0 — lô đã về 0 (Admin sửa tay hoặc xuất hết) coi như không còn xếp trên kệ nữa, phải
      // biến mất khỏi mọi nơi hiển thị (kể cả dialog "Sửa số lượng lô cây") — lô vẫn còn ACTIVE trong DB
      // nên Nhập kho thủ công merge lại đúng lô cũ nếu sau này nhập lại đúng mã cây/quy cách đó.
      where: { status: "ACTIVE" as const, quantity: { gt: 0 } },
      select: { id: true, code: true, quantity: true, stageCode: true, plantType: { select: { code: true, name: true } } },
    },
  },
  orderBy: [{ rowNumber: "asc" as const }, { colNumber: "asc" as const }],
};

// Tách khỏi page.tsx để dùng lại được y hệt ở cả route gốc (/warehouses) lẫn tab "Kho & Kệ" trong hub
// /production-management — xem plan gộp menu Admin, tránh trùng lặp logic.
export default async function WarehousesContent({ role }: { role: UserRole | null }) {
  const [warehouses, saleUsers, caymoStaff] = await Promise.all([
    prisma.warehouse.findMany({
      where: { isActive: true },
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
  const canManageStaffAndPlant = role === "SUPER_ADMIN";
  const canMoveRoom = isAdminRole(role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Kho & Giàn kệ</h1>
          <p className="text-text-secondary text-sm mt-1">{warehouses.length} kho — bấm vào từng kho để xem phòng, bấm vào từng phòng để xem chi tiết giàn kệ</p>
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
