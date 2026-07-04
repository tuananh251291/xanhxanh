"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Warehouse as WarehouseIcon, Layers } from "lucide-react";
import { WAREHOUSE_TYPE_LABELS, WAREHOUSE_TYPE_COLORS, ROOM_TYPE_LABELS, ROOM_TYPE_COLORS } from "@/types";
import type { WarehouseType, RoomType } from "@prisma/client";
import AddMarketRoomDialog from "./add-market-room-dialog";
import RoomAccessDialog from "./room-access-dialog";
import ShelfTable from "./shelf-table";

type PlantType = { id: string; code: string; name: string };
type Staff = { id: string; code: string; name: string };
type ShelfData = {
  id: string;
  code: string;
  name: string;
  rowNumber: number | null;
  colNumber: number | null;
  capacity: number | null;
  plantType: PlantType | null;
  assignedStaff: Staff | null;
  lots: { quantity: number; stageCode: string }[];
};
type RoomData = {
  id: string;
  code: string;
  name: string;
  type: RoomType;
  shelves: ShelfData[];
  roomAccess: { userId: string }[];
};
type WarehouseData = {
  id: string;
  code: string;
  name: string;
  type: WarehouseType;
  rooms: RoomData[];
  shelves: ShelfData[]; // kệ gắn thẳng kho, không qua phòng
};

export default function WarehouseBoard({
  warehouses,
  saleUsers,
  caymoStaff,
  canManageStaffAndPlant,
  canMoveRoom,
}: {
  warehouses: WarehouseData[];
  saleUsers: { id: string; name: string; email: string }[];
  caymoStaff: Staff[];
  canManageStaffAndPlant: boolean;
  canMoveRoom: boolean;
}) {
  const [expandedWarehouses, setExpandedWarehouses] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  const toggleWarehouse = (id: string) => {
    setExpandedWarehouses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleRoom = (id: string) => {
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {warehouses.map((wh) => {
        const whExpanded = expandedWarehouses.has(wh.id);
        const shelfCount = wh.rooms.reduce((s, r) => s + r.shelves.length, 0) + wh.shelves.length;
        return (
          <Card key={wh.id}>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => toggleWarehouse(wh.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {whExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                  <WarehouseIcon className="w-5 h-5 text-gray-400 shrink-0" />
                  <CardTitle className="text-lg">{wh.name}</CardTitle>
                  <Badge className={WAREHOUSE_TYPE_COLORS[wh.type]}>{WAREHOUSE_TYPE_LABELS[wh.type]}</Badge>
                  <span className="text-sm text-gray-500">({wh.code})</span>
                  <span className="text-sm text-gray-400">· {wh.rooms.length} phòng · {shelfCount} kệ</span>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  {wh.type === "THANH_PHAM" && (
                    <AddMarketRoomDialog warehouseId={wh.id} warehouseCode={wh.code} />
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => toggleWarehouse(wh.id)}>
                    {whExpanded ? "Thu gọn" : "Xem thêm"}
                  </Button>
                </div>
              </div>
            </CardHeader>

            {whExpanded && (
              <CardContent className="space-y-3 pt-0">
                {wh.rooms.length === 0 && wh.shelves.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">Chưa có phòng/giàn kệ nào</p>
                )}

                {wh.rooms.map((room) => {
                  const roomExpanded = expandedRooms.has(room.id);
                  return (
                    <div key={room.id} className="border rounded-lg">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-gray-50"
                        onClick={() => toggleRoom(room.id)}
                      >
                        <div className="flex items-center gap-2">
                          {roomExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
                          <Layers className="w-4 h-4 text-gray-400 shrink-0" />
                          <h3 className="font-medium text-gray-800">{room.name}</h3>
                          <Badge className={ROOM_TYPE_COLORS[room.type]}>{ROOM_TYPE_LABELS[room.type]}</Badge>
                          <span className="text-xs text-gray-400">({room.code})</span>
                          <span className="text-xs text-gray-400">· {room.shelves.length} kệ</span>
                        </div>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {room.type === "PHONG_THI_TRUONG" && (
                            <RoomAccessDialog
                              roomId={room.id}
                              roomName={room.name}
                              saleUsers={saleUsers}
                              initialUserIds={room.roomAccess.map((a) => a.userId)}
                            />
                          )}
                          <Button type="button" variant="ghost" size="sm" onClick={() => toggleRoom(room.id)}>
                            {roomExpanded ? "Thu gọn" : "Xem chi tiết"}
                          </Button>
                        </div>
                      </div>
                      {roomExpanded && (
                        <div className="px-4 pb-4">
                          {room.shelves.length === 0 ? (
                            <p className="text-gray-400 text-sm text-center py-3">Chưa có giàn kệ nào</p>
                          ) : (
                            <ShelfTable
                              shelves={room.shelves}
                              currentRoomId={room.id}
                              currentRoomType={room.type}
                              staffOptions={caymoStaff}
                              canManageStaffAndPlant={canManageStaffAndPlant}
                              canMoveRoom={canMoveRoom}
                              moveableRooms={wh.rooms.filter((r) => r.type === "PHONG_MAU_ME" || r.type === "PHONG_RA_RE")}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {wh.shelves.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-gray-500 mb-3">Kệ gắn thẳng kho (không qua phòng)</p>
                    <ShelfTable
                      shelves={wh.shelves}
                      currentRoomId={null}
                      currentRoomType={null}
                      staffOptions={caymoStaff}
                      canManageStaffAndPlant={canManageStaffAndPlant}
                      canMoveRoom={canMoveRoom}
                      moveableRooms={wh.rooms.filter((r) => r.type === "PHONG_MAU_ME" || r.type === "PHONG_RA_RE")}
                    />
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
