"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

type PlantType = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string; type: "SAN_XUAT" | "THANH_PHAM" };
type ComboOption = { value: string; label: string };
type StageCode = "M05" | "T05" | "T01";

const WAREHOUSE_TYPE_LABEL: Record<Warehouse["type"], string> = {
  SAN_XUAT: "Khu sản xuất",
  THANH_PHAM: "Kho thành phẩm",
};
const STAGE_OPTIONS: { value: StageCode; label: string }[] = [
  { value: "M05", label: "M05 — Mẫu mẹ" },
  { value: "T05", label: "T05 — Thành phẩm túi 5" },
  { value: "T01", label: "T01 — Thành phẩm túi 1" },
];

export default function RndHandoverBoard() {
  const [loading, setLoading] = useState(true);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption | null>(null);
  const [stageCode, setStageCode] = useState<StageCode>("M05");
  const [quantity, setQuantity] = useState("");
  const [destOption, setDestOption] = useState<ComboOption | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/plant-types").then((r) => r.json()),
      fetch("/api/rnd-warehouse-handover/send").then((r) => r.json()),
    ])
      .then(([plantTypesData, sendData]) => {
        setPlantTypes(Array.isArray(plantTypesData) ? plantTypesData : []);
        setWarehouses(Array.isArray(sendData.warehouses) ? sendData.warehouses : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }));
  const destOptions: ComboOption[] = warehouses.map((w) => ({ value: w.id, label: `[${WAREHOUSE_TYPE_LABEL[w.type]}] ${w.code} — ${w.name}` }));
  const selectedWarehouse = destOption ? warehouses.find((w) => w.id === destOption.value) ?? null : null;
  const invalidForThanhPham = selectedWarehouse?.type === "THANH_PHAM" && stageCode === "M05";
  const canSubmit = !!plantTypeOption && quantity.trim() && !!destOption && !invalidForThanhPham && !submitting;

  const reset = () => { setPlantTypeOption(null); setStageCode("M05"); setQuantity(""); setDestOption(null); };

  const submit = async () => {
    if (!canSubmit || !plantTypeOption || !destOption) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/rnd-warehouse-handover/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantTypeId: plantTypeOption.value,
          stageCode,
          quantity: Number(quantity),
          toWarehouseId: destOption.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Bàn giao thất bại"); return; }
      toast.success(`Đã gửi phiếu ${data.transferCode} — ${data.totalQuantity.toLocaleString("vi-VN")} cụm tới ${data.toWarehouseName}`);
      reset();
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-sm">Mã cây <span className="text-destructive">*</span></Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(val) => setPlantTypeOption(val as ComboOption | null)}
            >
              <ComboboxInputGroup className="w-full h-9">
                <ComboboxInput placeholder="Gõ mã/tên cây…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy mã cây</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Quy cách <span className="text-destructive">*</span></Label>
            <Select items={STAGE_OPTIONS} value={stageCode} onValueChange={(v) => setStageCode((v as StageCode) ?? "M05")}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-sm">Số lượng <span className="text-destructive">*</span></Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="VD: 100" />
          </div>
          <div className="space-y-1">
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
        </div>

        {invalidForThanhPham && (
          <p className="text-xs text-destructive">Kho thành phẩm chỉ nhận được quy cách thành phẩm (T05/T01) — đổi quy cách hoặc chọn kho đích là 1 khu sản xuất</p>
        )}

        <p className="text-xs text-text-muted">
          Tự khai đúng số lượng đang có trong tay — hệ thống tạo phiếu bàn giao ngay, kho đích xác nhận
          nhận rồi mới cộng vào tồn kho của họ.
        </p>

        <Button type="button" className="w-full sm:w-auto bg-primary hover:bg-primary-hover" disabled={!canSubmit} onClick={submit}>
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Bàn giao
        </Button>
      </CardContent>
    </Card>
  );
}
