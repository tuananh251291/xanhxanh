"use client";

import { useState, useCallback, useMemo } from "react";
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
import { PackagePlus, Loader2, Warehouse as WarehouseIcon } from "lucide-react";
import { toast } from "sonner";

type Warehouse = { id: string; name: string };
type PlantType = { id: string; code: string; name: string };
type EligibleShelf = { id: string; code: string; name: string; capacity: number | null; used: number; capLeft: number | null; full: boolean };
type ComboOption = { value: string; label: string; disabled?: boolean };

const STAGE_OPTIONS = [
  { value: "MAU_ME", label: "Cụm mẫu mẹ" },
  { value: "THANH_PHAM", label: "Cây ra rễ" },
];

const STAGE_CODE_OPTIONS: Record<"MAU_ME" | "THANH_PHAM", { value: string; label: string }[]> = {
  MAU_ME: [{ value: "M05", label: "M05 — túi 5 cụm" }],
  THANH_PHAM: [
    { value: "T01", label: "T01 — túi 1 cây" },
    { value: "T05", label: "T05 — túi 5 cây" },
    { value: "T10", label: "T10 — túi 10 cây" },
  ],
};

const MODE_OPTIONS: { value: "ADD" | "REPLACE"; label: string }[] = [
  { value: "ADD", label: "Cộng thêm vào số đang có" },
  { value: "REPLACE", label: "Cập nhật thay thế số lượng" },
];

export default function StockInForm({
  fixedWarehouse,
  warehouses,
  plantTypes,
}: {
  fixedWarehouse: Warehouse | null;
  warehouses: Warehouse[];
  plantTypes: PlantType[];
}) {
  const isAdmin = !fixedWarehouse;
  const [warehouseId, setWarehouseId] = useState(fixedWarehouse?.id ?? "");
  const [stage, setStage] = useState<"MAU_ME" | "THANH_PHAM">("MAU_ME");
  const [mode, setMode] = useState<"ADD" | "REPLACE">("ADD");
  const [plantTypeId, setPlantTypeId] = useState("");
  const [stageCode, setStageCode] = useState("M05");
  const [shelfId, setShelfId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [shelves, setShelves] = useState<EligibleShelf[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const warehouseOptions: ComboOption[] = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));
  const unit = stage === "MAU_ME" ? "cụm" : "cây";

  const loadShelves = useCallback(async (currentWarehouseId: string, currentStage: "MAU_ME" | "THANH_PHAM", currentPlantTypeId: string) => {
    if (!currentWarehouseId || !currentPlantTypeId) { setShelves([]); return; }
    setLoadingShelves(true);
    try {
      const params = new URLSearchParams({ stage: currentStage, plantTypeId: currentPlantTypeId, warehouseId: currentWarehouseId });
      const res = await fetch(`/api/inventory/stock-in/shelves?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Không tải được danh sách giàn kệ"); setShelves([]); return; }
      setShelves(data);
    } finally {
      setLoadingShelves(false);
    }
  }, []);

  const shelfOptions: ComboOption[] = useMemo(
    () =>
      shelves.map((s) => ({
        value: s.id,
        label: `${s.code} — còn ${s.capacity === null ? "không giới hạn" : `${s.capLeft?.toLocaleString("vi-VN")}/${s.capacity.toLocaleString("vi-VN")}`}${s.full ? " (đầy)" : ""}`,
        disabled: s.full,
      })),
    [shelves]
  );

  const changeWarehouse = (id: string) => {
    setWarehouseId(id);
    setPlantTypeId("");
    setShelfId("");
    setShelves([]);
  };

  const changeStage = (v: "MAU_ME" | "THANH_PHAM") => {
    setStage(v);
    setStageCode(STAGE_CODE_OPTIONS[v][0].value);
    setShelfId("");
    loadShelves(warehouseId, v, plantTypeId);
  };

  const changePlantType = (id: string) => {
    setPlantTypeId(id);
    setShelfId("");
    loadShelves(warehouseId, stage, id);
  };

  const submit = async () => {
    if (isAdmin && !warehouseId) { toast.error("Chọn kho sản xuất"); return; }
    if (!plantTypeId) { toast.error("Chọn mã cây"); return; }
    if (!shelfId) { toast.error("Chọn giàn kệ"); return; }
    const qty = Number(quantity);
    if (!qty || qty <= 0) { toast.error("Số lượng phải lớn hơn 0"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, plantTypeId, stageCode, shelfId, quantity: qty, mode, warehouseId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      if (json.created) {
        toast.success(`Đã tạo lô mới ${json.lot.code} — ${json.newQuantity.toLocaleString("vi-VN")} ${unit}`);
      } else if (mode === "ADD") {
        toast.success(`Đã cộng thêm ${qty.toLocaleString("vi-VN")} vào lô ${json.lot.code} — hiện có ${json.newQuantity.toLocaleString("vi-VN")} ${unit}`);
      } else {
        toast.success(`Đã cập nhật lô ${json.lot.code} từ ${json.previousQuantity.toLocaleString("vi-VN")} thành ${json.newQuantity.toLocaleString("vi-VN")} ${unit}`);
      }
      setQuantity("");
      loadShelves(warehouseId, stage, plantTypeId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PackagePlus className="w-4 h-4" /> {fixedWarehouse ? fixedWarehouse.name : "Nhập kho"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isAdmin && (
            <div className="space-y-1 sm:col-span-2">
              <Label className="flex items-center gap-1"><WarehouseIcon className="w-3.5 h-3.5" /> Kho sản xuất *</Label>
              <Select items={warehouseOptions} value={warehouseId} onValueChange={(v) => changeWarehouse(v as string)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Chọn kho sản xuất" /></SelectTrigger>
                <SelectContent>
                  {warehouseOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Loại tồn *</Label>
            <Select items={STAGE_OPTIONS} value={stage} onValueChange={(v) => changeStage(v as "MAU_ME" | "THANH_PHAM")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Quy cách *</Label>
            <Select items={STAGE_CODE_OPTIONS[stage]} value={stageCode} onValueChange={(v) => setStageCode(v as string)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_CODE_OPTIONS[stage].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label>Kiểu nhập *</Label>
            <Select items={MODE_OPTIONS} value={mode} onValueChange={(v) => setMode(v as "ADD" | "REPLACE")}>
              <SelectTrigger className="w-full sm:w-80"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-secondary">
              {mode === "ADD"
                ? "Nếu giàn kệ đã có sẵn lô cùng mã cây + quy cách, số nhập sẽ CỘNG THÊM vào lô đó."
                : "Nếu giàn kệ đã có sẵn lô cùng mã cây + quy cách, số lượng lô đó sẽ được GHI ĐÈ thành đúng số vừa nhập (dùng khi kiểm kê ra số thực tế)."}
            </p>
          </div>

          <div className="space-y-1">
            <Label>Mã cây *</Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOptions.find((o) => o.value === plantTypeId) ?? null}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => changePlantType(v ? (v as ComboOption).value : "")}
              disabled={isAdmin && !warehouseId}
            >
              <ComboboxInputGroup className="w-full h-11 md:h-8">
                <ComboboxInput placeholder={isAdmin && !warehouseId ? "Chọn kho trước" : "Gõ mã hoặc tên cây…"} />
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
            <Label>Giàn kệ * {loadingShelves && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}</Label>
            <Combobox
              items={shelfOptions}
              value={shelfOptions.find((o) => o.value === shelfId) ?? null}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => setShelfId(v ? (v as ComboOption).value : "")}
              disabled={!plantTypeId || loadingShelves}
            >
              <ComboboxInputGroup className="w-full h-11 md:h-8">
                <ComboboxInput placeholder={plantTypeId ? "Gõ mã giàn kệ…" : "Chọn mã cây trước"} />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không có giàn kệ nào được phép xếp mã cây này</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item} disabled={item.disabled}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="space-y-1">
            <Label>Số lượng ({unit}) *</Label>
            <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={`Số ${unit}`} />
          </div>
        </div>

        <Button onClick={submit} disabled={submitting} className="bg-primary hover:bg-primary-hover">
          {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <PackagePlus className="w-4 h-4 mr-1.5" />}
          {mode === "ADD" ? "Cộng thêm" : "Cập nhật thay thế"}
        </Button>
      </CardContent>
    </Card>
  );
}
