"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type RndLot = {
  id: string; code: string; stage: "MAU_ME" | "THANH_PHAM"; stageCode: string; quantity: number; enteredAt: string;
  plantType: { code: string; name: string };
};
type Warehouse = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };

// Bàn giao sản phẩm R&D (mẫu mẹ hoặc thành phẩm, đang nằm trong Phòng tối cá nhân R&D, đã kiểm tra
// nhiễm) sang 1 kho sản xuất THẬT khác — xem POST /api/rnd-warehouse-handover/send. Kho mô kho đích xác
// nhận ở tab "Từ R&D" tại /mother-warehouse-transfer.
export default function SendHandoverDialog({ onSent }: { onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<RndLot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedLotIds, setSelectedLotIds] = useState<Set<string>>(new Set());
  const [destOption, setDestOption] = useState<ComboOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/rnd-warehouse-handover/send")
      .then((r) => r.json())
      .then((data) => {
        setLots(Array.isArray(data.lots) ? data.lots : []);
        setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const reset = () => { setSelectedLotIds(new Set()); setDestOption(null); };

  const toggleLot = (lotId: string) => {
    setSelectedLotIds((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId); else next.add(lotId);
      return next;
    });
  };

  const destOptions: ComboOption[] = warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }));
  const selectedLots = lots.filter((l) => selectedLotIds.has(l.id));
  const mixedStage = new Set(selectedLots.map((l) => l.stage)).size > 1;
  const totalQuantity = selectedLots.reduce((s, l) => s + l.quantity, 0);
  const canSubmit = selectedLotIds.size > 0 && !mixedStage && !!destOption && !submitting;

  const submit = async () => {
    if (!canSubmit || !destOption) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rnd-warehouse-handover/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotIds: Array.from(selectedLotIds), toWarehouseId: destOption.value }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Bàn giao thất bại"); return; }
      toast.success(`Đã gửi phiếu ${data.transferCode} — ${data.totalQuantity.toLocaleString("vi-VN")} cụm tới ${data.toWarehouseName}`);
      reset();
      setOpen(false);
      onSent();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <Send className="w-4 h-4 mr-1.5" /> Bàn giao sang kho khác
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Send className="w-5 h-5" /> Bàn giao sang kho sản xuất khác</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : (
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs">Chọn lô đã kiểm tra nhiễm, sẵn sàng bàn giao</Label>
              {lots.length === 0 ? (
                <p className="text-sm text-text-muted py-4 text-center">Chưa có lô nào đã kiểm tra nhiễm sẵn sàng bàn giao</p>
              ) : (
                <div className="max-h-56 overflow-y-auto border border-divider rounded-md divide-y divide-divider">
                  {lots.map((lot) => (
                    <label key={lot.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-primary-light/30">
                      <Checkbox checked={selectedLotIds.has(lot.id)} onCheckedChange={() => toggleLot(lot.id)} />
                      <span className="flex-1">
                        <span className="font-mono text-info-foreground">{lot.code}</span> — {lot.plantType.code} ({lot.stageCode}) —{" "}
                        {lot.quantity.toLocaleString("vi-VN")} cụm
                        <span className="text-text-muted"> · {format(new Date(lot.enteredAt), "dd/MM/yyyy", { locale: vi })}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {mixedStage && (
                <p className="text-xs text-destructive">Chỉ chọn được các lô CÙNG loại (mẫu mẹ hoặc thành phẩm) trong 1 lần gửi</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kho sản xuất đích <span className="text-destructive">*</span></Label>
              <Combobox
                items={destOptions}
                value={destOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={(val) => setDestOption(val as ComboOption | null)}
              >
                <ComboboxInputGroup>
                  <ComboboxInput placeholder="Gõ mã/tên kho…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không có kho sản xuất khác</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
              {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Bàn giao {totalQuantity > 0 && `(${totalQuantity.toLocaleString("vi-VN")} cụm)`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
