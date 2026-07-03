"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Package, Leaf, User } from "lucide-react";
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

export default function ShelfList({
  shelves,
  currentRoomId,
  currentRoomType,
  plantTypes = [],
  staffOptions = [],
  canManageStaffAndPlant = false,
  canMoveRoom = false,
  moveableRooms = [],
}: {
  shelves: Shelf[];
  currentRoomId: string | null;
  currentRoomType: RoomType | null;
  plantTypes?: PlantType[];
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

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {shelves.map((shelf) => {
          const used = shelf.lots.reduce((s, l) => s + motherClusterUnits(l.stageCode, l.quantity), 0);
          const usage = shelf.capacity ? Math.round((used / shelf.capacity) * 100) : null;
          return (
            <div key={shelf.id} className="border rounded-lg p-3 bg-white hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setQrShelf(shelf)}>
                <span className="text-xs font-bold text-gray-700">{shelf.code}</span>
                <QrCode className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 truncate mb-1">{shelf.name}</p>
              {isMauMeRoom && (
                <>
                  <div className="flex items-center gap-1 mb-1">
                    <Leaf className="w-3 h-3 text-emerald-500" />
                    <span className="text-xs text-gray-600 truncate">{shelf.plantType?.code ?? "Chưa gán"}</span>
                  </div>
                  <div className="flex items-center gap-1 mb-1">
                    <User className="w-3 h-3 text-blue-500" />
                    <span className="text-xs text-gray-600 truncate">{shelf.assignedStaff?.name ?? "Chưa gán"}</span>
                  </div>
                </>
              )}
              <div className="flex items-center gap-1">
                <Package className="w-3 h-3 text-green-500" />
                <span className="text-xs text-gray-600">
                  {used.toLocaleString("vi-VN")}
                  {shelf.capacity ? `/${shelf.capacity}` : ""}
                  {isMauMeRoom && " cụm"}
                </span>
              </div>
              {usage !== null && (
                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usage > 90 ? "bg-red-500" : usage > 70 ? "bg-yellow-500" : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min(usage, 100)}%` }}
                  />
                </div>
              )}
              {isMauMeRoom && canManageStaffAndPlant && (
                <>
                  <Select
                    value={shelf.plantType?.id ?? "NONE"}
                    onValueChange={(v) => patchShelf(shelf.id, { plantTypeId: v === "NONE" ? null : v }, "Đã cập nhật loại cây cho kệ")}
                  >
                    <SelectTrigger className="w-full mt-2 h-7 text-xs" disabled={savingId === shelf.id}>
                      <SelectValue placeholder="Mã cây" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Chưa gán mã cây —</SelectItem>
                      {plantTypes.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={shelf.assignedStaff?.id ?? "NONE"}
                    onValueChange={(v) => patchShelf(shelf.id, { assignedStaffId: v === "NONE" ? null : v }, "Đã cập nhật nhân viên cho kệ")}
                  >
                    <SelectTrigger className="w-full mt-1 h-7 text-xs" disabled={savingId === shelf.id}>
                      <SelectValue placeholder="Nhân viên" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Chưa gán nhân viên —</SelectItem>
                      {staffOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              {canMoveRoom && otherRooms.length > 0 && (
                <Select
                  value="_"
                  onValueChange={(v) => patchShelf(shelf.id, { roomId: v }, "Đã chuyển kệ sang phòng khác")}
                >
                  <SelectTrigger className="w-full mt-1 h-7 text-xs" disabled={savingId === shelf.id}>
                    <SelectValue placeholder="Chuyển phòng…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_" disabled>Chuyển sang…</SelectItem>
                    {otherRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          );
        })}
      </div>

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
