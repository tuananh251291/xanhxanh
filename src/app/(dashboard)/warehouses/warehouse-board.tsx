"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Warehouse as WarehouseIcon, Layers, Search, Sun, Moon } from "lucide-react";
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
  sharedMotherPool: "QUA_HAN" | "DUNG_HAN" | null;
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

// Các phòng này không có Shelf nào, không cần hiện quản lý kệ: kho thành phẩm không quản lý theo giàn
// kệ; Phòng tối cá nhân (1 Room/NV) và Phòng Nhiễm cũng vậy — lô gắn thẳng vào Room (Lot.roomId).
const NO_SHELF_ROOM_TYPES = new Set<RoomType>([
  "PHONG_KHA_DUNG", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG", "PHONG_TOI", "PHONG_NHIEM",
]);
// Kho sản xuất chỉ có đúng 4 loại phòng này — nhóm lại 2 tầng cho dễ nhìn: Phòng sáng (mẫu mẹ + ra rễ)
// và Phòng tối (phòng nhiễm + các phòng tối cá nhân theo từng NV cấy mô).
const BRIGHT_ROOM_TYPES = new Set<RoomType>(["PHONG_MAU_ME", "PHONG_RA_RE"]);
const DARK_ROOM_TYPES = new Set<RoomType>(["PHONG_TOI", "PHONG_NHIEM"]);

type WarehouseData = {
  id: string;
  code: string;
  name: string;
  type: WarehouseType;
  rooms: RoomData[];
  shelves: ShelfData[]; // kệ gắn thẳng kho, không qua phòng
};

function RoomCard({
  room, wh, expanded, onToggle, saleUsers, caymoStaff, canManageStaffAndPlant, canMoveRoom,
}: {
  room: RoomData;
  wh: WarehouseData;
  expanded: boolean;
  onToggle: () => void;
  saleUsers: { id: string; name: string; email: string }[];
  caymoStaff: Staff[];
  canManageStaffAndPlant: boolean;
  canMoveRoom: boolean;
}) {
  const isDarkRoom = room.type === "PHONG_TOI" || room.type === "PHONG_NHIEM";

  return (
    <div className="border rounded-lg">
      <div
        className={
          isDarkRoom
            ? "flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            : "flex flex-wrap items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none hover:bg-muted"
        }
        onClick={isDarkRoom ? undefined : onToggle}
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {!isDarkRoom && (expanded ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />)}
          <Layers className="w-4 h-4 text-text-muted shrink-0" />
          <h3 className="font-medium text-foreground">{room.name}</h3>
          <Badge className={ROOM_TYPE_COLORS[room.type]}>{ROOM_TYPE_LABELS[room.type]}</Badge>
          <span className="text-xs text-text-muted">({room.code})</span>
          {!NO_SHELF_ROOM_TYPES.has(room.type) && (
            <span className="text-xs text-text-muted">· {room.shelves.length} kệ</span>
          )}
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
          {isDarkRoom ? (
            <Link href={`/inventory/phong-toi/${wh.id}/${room.id}`}>
              <Button type="button" size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
              </Button>
            </Link>
          ) : (
            <Button
              type="button"
              size="sm"
              className={expanded ? "h-8" : "h-8 bg-primary hover:bg-primary-hover"}
              variant={expanded ? "ghost" : "default"}
              onClick={onToggle}
            >
              {!expanded && <Search className="w-3.5 h-3.5 mr-1.5" />}
              {expanded ? "Thu gọn" : "Xem chi tiết"}
            </Button>
          )}
        </div>
      </div>
      {!isDarkRoom && expanded && (
        <div className="px-4 pb-4">
          {NO_SHELF_ROOM_TYPES.has(room.type) ? (
            <p className="text-text-muted text-sm text-center py-3">
              Kho thành phẩm không quản lý theo giàn kệ — xem tồn kho tại trang Tồn kho thành phẩm
            </p>
          ) : room.shelves.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-3">Chưa có giàn kệ nào</p>
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
}

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());

  const toggleWarehouse = (id: string) => {
    setExpandedWarehouses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
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

  const roomCardProps = { saleUsers, caymoStaff, canManageStaffAndPlant, canMoveRoom };

  return (
    <div className="space-y-4">
      {warehouses.map((wh) => {
        const whExpanded = expandedWarehouses.has(wh.id);
        const shelfCount = wh.rooms.reduce((s, r) => s + r.shelves.length, 0) + wh.shelves.length;
        const brightRooms = wh.rooms.filter((r) => BRIGHT_ROOM_TYPES.has(r.type));
        // Phòng nhiễm luôn hiện trên cùng trong nhóm Phòng tối, trước các phòng tối cá nhân theo NV.
        const darkRooms = wh.rooms
          .filter((r) => DARK_ROOM_TYPES.has(r.type))
          .sort((a, b) => (a.type === "PHONG_NHIEM" ? -1 : b.type === "PHONG_NHIEM" ? 1 : 0));
        const isSanXuat = wh.type === "SAN_XUAT";
        const sangGroupId = `${wh.id}:sang`;
        const toiGroupId = `${wh.id}:toi`;

        return (
          <Card key={wh.id}>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => toggleWarehouse(wh.id)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {whExpanded ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
                  <WarehouseIcon className="w-5 h-5 text-text-muted shrink-0" />
                  <CardTitle className="text-lg">{wh.name}</CardTitle>
                  <Badge className={WAREHOUSE_TYPE_COLORS[wh.type]}>{WAREHOUSE_TYPE_LABELS[wh.type]}</Badge>
                  <span className="text-sm text-text-secondary">({wh.code})</span>
                  <span className="text-sm text-text-muted">· {wh.rooms.length} phòng · {shelfCount} kệ</span>
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
                  <p className="text-text-muted text-sm text-center py-4">Chưa có phòng/giàn kệ nào</p>
                )}

                {isSanXuat ? (
                  <>
                    {[
                      { id: sangGroupId, label: "Phòng sáng", Icon: Sun, rooms: brightRooms },
                      { id: toiGroupId, label: "Phòng tối", Icon: Moon, rooms: darkRooms },
                    ].map(({ id, label, Icon, rooms }) => {
                      const groupExpanded = expandedGroups.has(id);
                      const groupShelfCount = rooms.reduce((s, r) => s + r.shelves.length, 0);
                      return (
                        <div key={id} className="border rounded-lg bg-muted/30">
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 cursor-pointer select-none hover:bg-muted"
                            onClick={() => toggleGroup(id)}
                          >
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              {groupExpanded ? <ChevronDown className="w-4 h-4 text-text-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
                              <Icon className="w-4 h-4 text-text-muted shrink-0" />
                              <h3 className="font-semibold text-foreground">{label}</h3>
                              <span className="text-xs text-text-muted">
                                · {rooms.length} phòng{groupShelfCount > 0 ? ` · ${groupShelfCount} kệ` : ""}
                              </span>
                            </div>
                            <Button type="button" variant="outline" size="sm" onClick={() => toggleGroup(id)}>
                              {groupExpanded ? "Thu gọn" : "Xem thêm"}
                            </Button>
                          </div>
                          {groupExpanded && (
                            <div className="space-y-3 px-4 pb-4">
                              {rooms.length === 0 ? (
                                <p className="text-text-muted text-sm text-center py-3">Chưa có phòng nào</p>
                              ) : (
                                rooms.map((room) => (
                                  <RoomCard
                                    key={room.id}
                                    room={room}
                                    wh={wh}
                                    expanded={expandedRooms.has(room.id)}
                                    onToggle={() => toggleRoom(room.id)}
                                    {...roomCardProps}
                                  />
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                ) : (
                  wh.rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      wh={wh}
                      expanded={expandedRooms.has(room.id)}
                      onToggle={() => toggleRoom(room.id)}
                      {...roomCardProps}
                    />
                  ))
                )}

                {wh.shelves.length > 0 && (
                  <div className="border rounded-lg p-4">
                    <p className="text-sm text-text-secondary mb-3">Kệ gắn thẳng kho (không qua phòng)</p>
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
