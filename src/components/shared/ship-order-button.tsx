"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PackageCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Shortage = { plantCode: string; plantName: string; stageCode: string; lotCode: string; roomName: string | null; needed: number; available: number; missing: number };

export default function ShipOrderButton({ orderId, orderCode, disabled }: { orderId: string; orderCode?: string; disabled: boolean }) {
  const [shipping, setShipping] = useState(false);
  const [shortages, setShortages] = useState<Shortage[] | null>(null);
  const router = useRouter();

  const ship = async () => {
    setShipping(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ship" }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Thiếu tồn thực: mở bảng chi tiết từng dòng thiếu (mã cây, quy cách, lô, cần/còn/thiếu).
        if (Array.isArray(json.shortages) && json.shortages.length > 0) {
          setShortages(json.shortages);
          toast.error(`Không đủ tồn thực để xuất kho — thiếu ${json.shortages.length} dòng, xem chi tiết`);
        } else toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã xuất kho — đơn hàng đã hoàn tất");
      router.refresh();
    } finally {
      setShipping(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("vi-VN");
  return (
    <>
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={disabled || shipping} onClick={ship}>
        {shipping ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
        Xuất kho
      </Button>
      <Dialog open={!!shortages} onOpenChange={(o) => { if (!o) setShortages(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Không đủ tồn thực để xuất {orderCode ?? "đơn"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">Các lô dưới đây không đủ số cây đơn cần — kiểm tra lại tồn kho thực tế (hoặc lô đã bị trừ/chuyển) trước khi xuất.</p>
          <div className="overflow-x-auto border border-divider rounded-lg max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Lô</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Cần</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Còn</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Thiếu</th>
                </tr>
              </thead>
              <tbody>
                {shortages?.map((s) => (
                  <tr key={s.lotCode} className="border-b border-divider last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-mono font-medium">{s.plantCode}</span>
                      <span className="block text-xs text-text-muted">{s.plantName}</span>
                    </td>
                    <td className="px-3 py-2 font-mono">{s.stageCode}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{s.lotCode}</span>
                      {s.roomName && <span className="block text-xs text-text-muted">{s.roomName}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(s.needed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(s.available)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-destructive">{fmt(s.missing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShortages(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
