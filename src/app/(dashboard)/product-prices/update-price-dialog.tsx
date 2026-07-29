"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type HistoryEntry = { id: string; price: number; effectiveMonth: string };

function currentMonthValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function UpdatePriceDialog({
  productId,
  productCode,
  currentPrice,
  history,
}: {
  productId: string;
  productCode: string;
  currentPrice: number | null;
  history: HistoryEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(currentMonthValue());
  const [price, setPrice] = useState(currentPrice != null ? String(currentPrice) : "");
  const router = useRouter();

  const submit = async () => {
    if (!price || Number(price) <= 0) { toast.error("Vui lòng nhập giá hợp lệ"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${productId}/prices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: Number(price), month }),
      });
      if (!res.ok) { toast.error((await res.json()).message); return; }
      toast.success(`Đã cập nhật giá ${productCode} tháng ${month}`);
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" title="Cập nhật giá" />}>
        <DollarSign className="w-4 h-4" />
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Cập nhật giá — {productCode}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tháng áp dụng</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Giá (USD)</Label>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="VD: 0.59" />
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <Label className="text-xs text-text-secondary">Lịch sử giá</Label>
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-divider divide-y">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                    <span className="text-text-secondary">{format(new Date(h.effectiveMonth), "MM/yyyy", { locale: vi })}</span>
                    <span className="font-medium text-foreground">${h.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Hủy</Button>
            <Button type="button" className="flex-1 bg-primary hover:bg-primary-hover" disabled={loading} onClick={submit}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Lưu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
