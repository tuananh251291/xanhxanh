"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import QRCodeDisplay from "@/components/shared/qr-code-display";
import { motherClusterUnits } from "@/types";
import type { RoomType } from "@prisma/client";

interface PlantType {
  id: string;
  code: string;
  name: string;
}

interface Staff {
  id: string;
  code: string;
  name: string;
}

interface MoveableRoom {
  id: string;
  code: string;
  name: string;
  type: RoomType;
}

interface Shelf {
  id: string;
  code: string;
  name: string;
  rowNumber: number | null;
  colNumber: number | null;
  capacity: number | null;
  plantType: PlantType | null;
  assignedStaff: Staff | null;
  lots: { quantity: number; stageCode: string }[];
}

export default function ShelfTable({
  shelves,
  currentRoomId,
  currentRoomType,
  staffOptions = [],
  canManageStaffAndPlant = false,
  canMoveRoom = false,
  moveableRooms = [],
}: {
  shelves: Shelf[];
  currentRoomId: string | null;
  currentRoomType: RoomType | null;
  staffOptions?: Staff[];
  canManageStaffAndPlant?: boolean;
  canMoveRoom?: boolean;
  moveableRooms?: MoveableRoom[];
}) {
  const [qrShelf, setQrShelf] = useState<Shelf | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const router = useRouter();
  const isMauMeRoom = currentRoomType === "PHONG_MAU_ME";
  const otherRooms = moveableRooms.filter((r) => r.id !== currentRoomId);

  const patchShelf = async (shelfId: string, body: Record<string, unknown>, successMsg: string) => {
    setSavingId(shelfId);
    try {
      const res = await fetch(`/api/shelves/${shelfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(successMsg);
      router.refresh();
    } finally { setSavingId(null); }
  };

  const renderRow = (shelf: Shelf) => {
    const used = shelf.lots.reduce((s, l) => s + motherClusterUnits(l.stageCode, l.quantity), 0);
    const usage = shelf.capacity ? Math.round((used / shelf.capacity) * 100) : null;
    const bagsBySpec = shelf.lots.reduce<Record<string, number>>((acc, l) => {
      acc[l.stageCode] = (acc[l.stageCode] ?? 0) + l.quantity;
      return acc;
    }, {});
    return (
      <tr key={shelf.id} className="border-b last:border-0 hover:bg-gray-50">
        <td className="px-3 py-2 whitespace-nowrap">
          <button
            className="flex items-center gap-1.5 text-left"
            onClick={() => setQrShelf(shelf)}
            title="Xem QR"
          >
            <span className="text-sm font-bold text-gray-700">{shelf.code}</span>
            <QrCode className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          </button>
        </td>
        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{shelf.name}</td>
        {isMauMeRoom && (
          <>
            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
              {shelf.plantType?.name ?? "—"}
            </td>
            <td className="px-3 py-2 min-w-[160px]">
              {canManageStaffAndPlant ? (
                <Select
                  value={shelf.assignedStaff?.id ?? "NONE"}
                  onValueChange={(v) => patchShelf(shelf.id, { assignedStaffId: v === "NONE" ? null : v }, "Đã cập nhật nhân viên cho kệ")}
                >
                  <SelectTrigger className="w-full h-8 text-xs" disabled={savingId === shelf.id}>
                    <SelectValue>
                      {(v: string | null) => {
                        if (!v || v === "NONE") return "— Chưa gán nhân viên —";
                        const s = staffOptions.find((x) => x.id === v);
                        return s ? `${s.name} (${s.code})` : "—";
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Chưa gán nhân viên —</SelectItem>
                    {staffOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-gray-600">{shelf.assignedStaff?.name ?? "Chưa gán"}</span>
              )}
            </td>
            <td className="px-3 py-2 whitespace-nowrap">
              {shelf.assignedStaff ? (
                <span
                  className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    shelf.lots.length > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                  }`}
                >
                  {shelf.lots.length > 0 ? "Đã có lô" : "Trống"}
                </span>
              ) : (
                <span className="text-xs text-gray-400">—</span>
              )}
            </td>
            <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
              {Object.keys(bagsBySpec).length === 0
                ? "—"
                : Object.entries(bagsBySpec)
                    .map(([spec, qty]) => `${spec}: ${qty} túi`)
                    .join(" · ")}
            </td>
          </>
        )}
        <td className="px-3 py-2 min-w-[140px]">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Package className="w-3 h-3 text-green-500 shrink-0" />
            {used.toLocaleString("vi-VN")}
            {shelf.capacity ? `/${shelf.capacity}` : ""}
            {isMauMeRoom && " cụm"}
          </div>
          {usage !== null && (
            <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usage > 90 ? "bg-red-500" : usage > 70 ? "bg-yellow-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(usage, 100)}%` }}
              />
            </div>
          )}
        </td>
        {canMoveRoom && (
          <td className="px-3 py-2 min-w-[150px]">
            {otherRooms.length > 0 ? (
              <Select
                value="_"
                onValueChange={(v) => patchShelf(shelf.id, { roomId: v }, "Đã chuyển kệ sang phòng khác")}
              >
                <SelectTrigger className="w-full h-8 text-xs" disabled={savingId === shelf.id}>
                  <SelectValue placeholder="Chuyển phòng…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_" disabled>Chuyển sang…</SelectItem>
                  {otherRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </td>
        )}
      </tr>
    );
  };

  const renderTable = (rows: Shelf[]) => (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Mã kệ</th>
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tên kệ</th>
            {isMauMeRoom && (
              <>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tên cây chi tiết</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Nhân viên phụ trách</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Trạng thái</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Số túi M03/M05</th>
              </>
            )}
            <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tồn / Sức chứa</th>
            {canMoveRoom && <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Chuyển phòng</th>}
          </tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    </div>
  );

  // Phòng mẫu mẹ tự chia làm 2 nhóm hiển thị theo việc đã gán nhân viên hay chưa (SUPER_ADMIN
  // cấu hình nhân viên ở trên) — không phải 1 Room riêng, chỉ là phân nhóm theo assignedStaff.
  const assignedShelves = isMauMeRoom ? shelves.filter((s) => s.assignedStaff) : [];
  const unassignedShelves = isMauMeRoom ? shelves.filter((s) => !s.assignedStaff) : [];

  return (
    <>
      {isMauMeRoom ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Kho mẫu mẹ đã chia <span className="font-normal text-gray-400">({assignedShelves.length} kệ)</span>
            </p>
            {assignedShelves.length === 0 ? (
              <p className="text-xs text-gray-400 pl-1">Chưa có kệ nào được gán nhân viên</p>
            ) : renderTable(assignedShelves)}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">
              Kho mẫu mẹ chung <span className="font-normal text-gray-400">({unassignedShelves.length} kệ)</span>
            </p>
            {unassignedShelves.length === 0 ? (
              <p className="text-xs text-gray-400 pl-1">Không còn kệ nào chưa gán nhân viên</p>
            ) : renderTable(unassignedShelves)}
          </div>
        </div>
      ) : (
        renderTable(shelves)
      )}

      <Dialog open={!!qrShelf} onOpenChange={() => setQrShelf(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>QR Code kệ {qrShelf?.code}</DialogTitle>
          </DialogHeader>
          {qrShelf && (
            <div className="text-center space-y-3">
              <QRCodeDisplay value={qrShelf.code} size={200} />
              <p className="text-sm font-medium">{qrShelf.name}</p>
              <p className="text-xs text-gray-500">{qrShelf.code}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
              >
                In QR Code
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
