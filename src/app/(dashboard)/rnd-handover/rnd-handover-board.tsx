"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
type Warehouse = { id: string; code: string; name: string; type: "SAN_XUAT" | "THANH_PHAM" };
type ComboOption = { value: string; label: string };

const WAREHOUSE_TYPE_LABEL: Record<Warehouse["type"], string> = {
  SAN_XUAT: "Khu sản xuất",
  THANH_PHAM: "Kho thành phẩm",
};

export default function RndHandoverBoard() {
  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState<RndLot[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedLotIds, setSelectedLotIds] = useState<Set<string>>(new Set());
  const [destOption, setDestOption] = useState<ComboOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rnd-warehouse-handover/send");
      const data = await res.json();
      setLots(Array.isArray(data.lots) ? data.lots : []);
      setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleLot = (lotId: string) => {
    setSelectedLotIds((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId); else next.add(lotId);
      return next;
    });
  };

  const destOptions: ComboOption[] = warehouses.map((w) => ({ value: w.id, label: `[${WAREHOUSE_TYPE_LABEL[w.type]}] ${w.code} — ${w.name}` }));
  const selectedWarehouse = destOption ? warehouses.find((w) => w.id === destOption.value) ?? null : null;
  const selectedLots = lots.filter((l) => selectedLotIds.has(l.id));
  const mixedStage = new Set(selectedLots.map((l) => l.stage)).size > 1;
  const invalidForThanhPham = selectedWarehouse?.type === "THANH_PHAM" && selectedLots.some((l) => l.stage !== "THANH_PHAM");
  const totalQuantity = selectedLots.reduce((s, l) => s + l.quantity, 0);
  const canSubmit = selectedLotIds.size > 0 && !mixedStage && !invalidForThanhPham && !!destOption && !submitting;

  const reset = () => { setSelectedLotIds(new Set()); setDestOption(null); };

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
      load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> Bàn giao sản phẩm R&D</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label className="text-sm">Chọn lô đã kiểm tra nhiễm, sẵn sàng bàn giao</Label>
          {lots.length === 0 ? (
            <p className="text-sm text-text-muted py-4 text-center">Chưa có lô nào đã kiểm tra nhiễm sẵn sàng bàn giao</p>
          ) : (
            <div className="max-h-64 overflow-y-auto border border-divider rounded-md divide-y divide-divider">
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
          {invalidForThanhPham && (
            <p className="text-xs text-destructive">Kho thành phẩm chỉ nhận được lô thành phẩm — bỏ chọn lô mẫu mẹ hoặc đổi kho đích là 1 khu sản xuất</p>
          )}
        </div>

        <div className="space-y-1 max-w-md">
          <Label className="text-sm">Kho đích (khu sản xuất hoặc kho thành phẩm) <span className="text-destructive">*</span></Label>
          <Combobox
            items={destOptions}
            value={destOption}
            isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
            onValueChange={(val) => setDestOption(val as ComboOption | null)}
          >
            <ComboboxInputGroup className="w-full h-9">
              <ComboboxInput placeholder="Gõ mã/tên kho…" />
              <ComboboxTrigger />
            </ComboboxInputGroup>
            <ComboboxContent>
              <ComboboxEmpty>Không có kho nào khác</ComboboxEmpty>
              <ComboboxList>
                {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>

        <p className="text-xs text-text-muted">
          Lô đã chọn sẽ được gửi TOÀN BỘ số lượng hiện có — kho đích xác nhận nhận rồi mới cộng vào tồn kho của họ.
        </p>

        <Button type="button" className="w-full sm:w-auto bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Bàn giao {totalQuantity > 0 && `(${totalQuantity.toLocaleString("vi-VN")} cụm)`}
        </Button>
      </CardContent>
    </Card>
  );
}
