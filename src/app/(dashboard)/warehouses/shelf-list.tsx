"use client";

import { useState } from "react";
import { QrCode, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRCodeDisplay from "@/components/shared/qr-code-display";

interface Shelf {
  id: string;
  code: string;
  name: string;
  rowNumber: number | null;
  colNumber: number | null;
  capacity: number | null;
  _count: { lots: number };
}

export default function ShelfList({ shelves, warehouseId }: { shelves: Shelf[]; warehouseId: string }) {
  const [qrShelf, setQrShelf] = useState<Shelf | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {shelves.map((shelf) => {
          const usage = shelf.capacity ? Math.round((shelf._count.lots / shelf.capacity) * 100) : null;
          return (
            <div
              key={shelf.id}
              className="border rounded-lg p-3 bg-white hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setQrShelf(shelf)}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700">{shelf.code}</span>
                <QrCode className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-500 truncate mb-2">{shelf.name}</p>
              <div className="flex items-center gap-1">
                <Package className="w-3 h-3 text-green-500" />
                <span className="text-xs text-gray-600">
                  {shelf._count.lots} lô
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
