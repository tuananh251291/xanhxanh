"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode, Package, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import QRCodeDisplay from "@/components/shared/qr-code-display";

interface PlantType {
  id: string;
  code: string;
  name: string;
}

interface Shelf {
  id: string;
  code: string;
  name: string;
  rowNumber: number | null;
  colNumber: number | null;
  capacity: number | null;
  plantType: PlantType | null;
  lots: { quantity: number }[];
}

export default function ShelfList({
  shelves,
  warehouseId,
  plantTypes = [],
  canManagePlantType = false,
}: {
  shelves: Shelf[];
  warehouseId: string;
  plantTypes?: PlantType[];
  canManagePlantType?: boolean;
}) {
  const [qrShelf, setQrShelf] = useState<Shelf | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const router = useRouter();

  const assignPlantType = async (shelfId: string, plantTypeId: string) => {
    setSavingId(shelfId);
    try {
      const res = await fetch(`/api/shelves/${shelfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantTypeId: plantTypeId === "NONE" ? null : plantTypeId }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật loại cây cho kệ");
      router.refresh();
    } finally { setSavingId(null); }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {shelves.map((shelf) => {
          const used = shelf.lots.reduce((s, l) => s + l.quantity, 0);
          const usage = shelf.capacity ? Math.round((used / shelf.capacity) * 100) : null;
          return (
            <div key={shelf.id} className="border rounded-lg p-3 bg-white hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setQrShelf(shelf)}>
                <span className="text-xs font-bold text-gray-700">{shelf.code}</span>
                <QrCode className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 truncate mb-1">{shelf.name}</p>
              <div className="flex items-center gap-1 mb-1">
                <Leaf className="w-3 h-3 text-emerald-500" />
                <span className="text-xs text-gray-600 truncate">{shelf.plantType?.code ?? "Chưa gán"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Package className="w-3 h-3 text-green-500" />
                <span className="text-xs text-gray-600">
                  {used.toLocaleString("vi-VN")}
                  {shelf.capacity ? `/${shelf.capacity}` : ""}
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
              {canManagePlantType && (
                <Select
                  value={shelf.plantType?.id ?? "NONE"}
                  onValueChange={(v) => assignPlantType(shelf.id, v as string)}
                >
                  <SelectTrigger className="w-full mt-2 h-7 text-xs" disabled={savingId === shelf.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Chưa gán —</SelectItem>
                    {plantTypes.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.code})</SelectItem>
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
