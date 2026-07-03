import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WAREHOUSE_TYPE_LABELS, WAREHOUSE_TYPE_COLORS, ROOM_TYPE_LABELS, ROOM_TYPE_COLORS } from "@/types";
import type { WarehouseType, RoomType } from "@prisma/client";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import CreateWarehouseDialog from "./create-warehouse-dialog";
import AddMarketRoomDialog from "./add-market-room-dialog";
import RoomAccessDialog from "./room-access-dialog";
import ShelfList from "./shelf-list";

const shelfInclude = {
  where: { isActive: true },
  include: {
    plantType: { select: { id: true, code: true, name: true } },
    assignedStaff: { select: { id: true, code: true, name: true } },
    lots: { where: { status: "ACTIVE" as const }, select: { quantity: true } },
  },
  orderBy: [{ rowNumber: "asc" as const }, { colNumber: "asc" as const }],
};

export default async function WarehousesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/warehouses"))) redirect("/dashboard");

  const [warehouses, saleUsers, caymoStaff, plantTypes] = await Promise.all([
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
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
  ]);
  const canManageStaffAndPlant = session?.user?.role === "SUPER_ADMIN";
  const canMoveRoom = isAdminRole(session?.user?.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kho & Giàn kệ</h1>
          <p className="text-gray-500 text-sm mt-1">{warehouses.length} kho</p>
        </div>
        <CreateWarehouseDialog />
      </div>

      <div className="space-y-6">
        {warehouses.map((wh) => (
          <Card key={wh.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{wh.name}</CardTitle>
                  <Badge className={WAREHOUSE_TYPE_COLORS[wh.type as WarehouseType]}>
                    {WAREHOUSE_TYPE_LABELS[wh.type as WarehouseType]}
                  </Badge>
                  <span className="text-sm text-gray-500">({wh.code})</span>
                </div>
                {wh.type === "THANH_PHAM" && (
                  <AddMarketRoomDialog warehouseId={wh.id} warehouseCode={wh.code} />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {wh.rooms.length === 0 && wh.shelves.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">Chưa có phòng/giàn kệ nào</p>
              )}

              {wh.rooms.map((room) => (
                <div key={room.id} className="border-t pt-4 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-800">{room.name}</h3>
                      <Badge className={ROOM_TYPE_COLORS[room.type as RoomType]}>
                        {ROOM_TYPE_LABELS[room.type as RoomType]}
                      </Badge>
                      <span className="text-xs text-gray-400">({room.code})</span>
                    </div>
                    {room.type === "PHONG_THI_TRUONG" && (
                      <RoomAccessDialog
                        roomId={room.id}
                        roomName={room.name}
                        saleUsers={saleUsers}
                        initialUserIds={room.roomAccess.map((a) => a.userId)}
                      />
                    )}
                  </div>
                  {room.shelves.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-3">Chưa có giàn kệ nào</p>
                  ) : (
                    <ShelfList
                      shelves={room.shelves}
                      currentRoomId={room.id}
                      currentRoomType={room.type as RoomType}
                      plantTypes={plantTypes}
                      staffOptions={caymoStaff}
                      canManageStaffAndPlant={canManageStaffAndPlant}
                      canMoveRoom={canMoveRoom}
                      moveableRooms={wh.rooms.filter((r) => r.type === "PHONG_MAU_ME" || r.type === "PHONG_RA_RE")}
                    />
                  )}
                </div>
              ))}

              {wh.shelves.length > 0 && (
                <div className="border-t pt-4 first:border-t-0 first:pt-0">
                  <ShelfList
                    shelves={wh.shelves}
                    currentRoomId={null}
                    currentRoomType={null}
                    plantTypes={plantTypes}
                    staffOptions={caymoStaff}
                    canManageStaffAndPlant={canManageStaffAndPlant}
                    canMoveRoom={canMoveRoom}
                    moveableRooms={wh.rooms.filter((r) => r.type === "PHONG_MAU_ME" || r.type === "PHONG_RA_RE")}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
