"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
type StaffOption = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string; disabled?: boolean };
type Destination = "SHELF" | "DARK_ROOM";

const STAGE_OPTIONS = [
  { value: "MAU_ME", label: "Phòng mẫu mẹ" },
  { value: "THANH_PHAM", label: "Phòng ra rễ" },
];

const STAGE_CODE_OPTIONS: Record<"MAU_ME" | "THANH_PHAM", { value: string; label: string }[]> = {
  MAU_ME: [{ value: "M05", label: "M05 — túi 5 cụm" }],
  THANH_PHAM: [
    { value: "T01", label: "T01 — túi 1 cây" },
    { value: "T05", label: "T05 — túi 5 cây" },
    { value: "T10", label: "T10 — túi 10 cây" },
  ],
};

// Gộp cả 4 quy cách (không tách bước "Khu vực" như bên Phòng sáng, vì Phòng tối chỉ có 1 phòng duy nhất
// cho mỗi NV, không tách Phòng mẫu mẹ/Phòng ra rễ vật lý) — chọn quy cách nào thì suy luôn ra stage.
const DARK_ROOM_STAGE_CODE_OPTIONS = [
  { value: "M05", label: "M05 — túi 5 cụm (mẫu mẹ)" },
  { value: "T01", label: "T01 — túi 1 cây (thành phẩm)" },
  { value: "T05", label: "T05 — túi 5 cây (thành phẩm)" },
  { value: "T10", label: "T10 — túi 10 cây (thành phẩm)" },
];
const stageOfCode = (code: string): "MAU_ME" | "THANH_PHAM" => (code === "M05" ? "MAU_ME" : "THANH_PHAM");

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

  // Nơi nhập — 2 lựa chọn loại trừ nhau, chọn 1 sẽ mờ hẳn phần nhập liệu còn lại.
  const [destination, setDestination] = useState<Destination>("SHELF");

  const [mode, setMode] = useState<"ADD" | "REPLACE">("ADD");
  const [plantTypeId, setPlantTypeId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Riêng Phòng sáng: có thêm bước "Khu vực" (Phòng mẫu mẹ/Phòng ra rễ) quyết định danh sách quy cách +
  // giàn kệ đề xuất.
  const [shelfStage, setShelfStage] = useState<"MAU_ME" | "THANH_PHAM">("MAU_ME");
  const [shelfStageCode, setShelfStageCode] = useState("M05");
  const [shelfId, setShelfId] = useState("");
  const [shelves, setShelves] = useState<EligibleShelf[]>([]);
  const [loadingShelves, setLoadingShelves] = useState(false);

  // Riêng Phòng tối: gộp quy cách + chọn NV cấy mô thay cho giàn kệ.
  const [darkRoomStageCode, setDarkRoomStageCode] = useState("M05");
  const [staffId, setStaffId] = useState("");
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);

  const stage = destination === "SHELF" ? shelfStage : stageOfCode(darkRoomStageCode);
  const stageCode = destination === "SHELF" ? shelfStageCode : darkRoomStageCode;
  const unit = stage === "MAU_ME" ? "cụm" : "cây";

  const warehouseOptions: ComboOption[] = warehouses.map((w) => ({ value: w.id, label: w.name }));
  const plantTypeOptions: ComboOption[] = plantTypes.map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));

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

  const loadStaff = useCallback(async (currentWarehouseId: string) => {
    if (!currentWarehouseId) { setStaffList([]); return; }
    setLoadingStaff(true);
    try {
      const res = await fetch(`/api/inventory/stock-in/staff?warehouseId=${currentWarehouseId}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.message ?? "Không tải được danh sách NV cấy mô"); setStaffList([]); return; }
      setStaffList(data);
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  // Vào Phòng tối lần đầu (hoặc đổi kho) mới tải danh sách NV — tránh gọi thừa khi đang ở Phòng sáng.
  useEffect(() => {
    if (destination === "DARK_ROOM" && warehouseId) loadStaff(warehouseId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, warehouseId]);

  const shelfOptions: ComboOption[] = useMemo(
    () =>
      shelves.map((s) => ({
        value: s.id,
        label: `${s.code} — còn ${s.capacity === null ? "không giới hạn" : `${s.capLeft?.toLocaleString("vi-VN")}/${s.capacity.toLocaleString("vi-VN")}`}${s.full ? " (đầy)" : ""}`,
        disabled: s.full,
      })),
    [shelves]
  );
  const staffOptions: ComboOption[] = useMemo(() => staffList.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })), [staffList]);

  const changeWarehouse = (id: string) => {
    setWarehouseId(id);
    setPlantTypeId("");
    setShelfId("");
    setShelves([]);
    setStaffId("");
    setStaffList([]);
  };

  const changeDestination = (d: Destination) => {
    setDestination(d);
    setShelfId("");
    setStaffId("");
  };

  const changeShelfStage = (v: "MAU_ME" | "THANH_PHAM") => {
    setShelfStage(v);
    setShelfStageCode(STAGE_CODE_OPTIONS[v][0].value);
    setShelfId("");
    if (destination === "SHELF") loadShelves(warehouseId, v, plantTypeId);
  };

  const changePlantType = (id: string) => {
    setPlantTypeId(id);
    setShelfId("");
    if (destination === "SHELF") loadShelves(warehouseId, shelfStage, id);
  };

  const submit = async () => {
    if (isAdmin && !warehouseId) { toast.error("Chọn kho sản xuất"); return; }
    if (!plantTypeId) { toast.error("Chọn mã cây"); return; }
    if (destination === "SHELF" && !shelfId) { toast.error("Chọn giàn kệ"); return; }
    if (destination === "DARK_ROOM" && !staffId) { toast.error("Chọn NV cấy mô"); return; }
    const qty = Number(quantity);
    if (!qty || qty <= 0) { toast.error("Số lượng phải lớn hơn 0"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/stock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          plantTypeId,
          stageCode,
          destination,
          shelfId: destination === "SHELF" ? shelfId : undefined,
          staffId: destination === "DARK_ROOM" ? staffId : undefined,
          quantity: qty,
          mode,
          warehouseId,
        }),
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
      if (destination === "SHELF") loadShelves(warehouseId, shelfStage, plantTypeId);
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
        {isAdmin && (
          <div className="space-y-1">
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
          <Label>Nơi nhập *</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={destination === "SHELF"} onCheckedChange={(c) => c && changeDestination("SHELF")} />
              <span className="text-sm text-foreground">Phòng sáng</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={destination === "DARK_ROOM"} onCheckedChange={(c) => c && changeDestination("DARK_ROOM")} />
              <span className="text-sm text-foreground">Phòng tối</span>
            </label>
          </div>
        </div>

        {/* Khối Phòng sáng — mờ đi khi đang chọn Phòng tối */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-divider p-3 transition-opacity ${destination === "DARK_ROOM" ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="space-y-1 sm:col-span-2">
            <Label>Khu vực *</Label>
            <div className="flex flex-wrap gap-4">
              {STAGE_OPTIONS.map((o) => (
                <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={shelfStage === o.value}
                    disabled={destination !== "SHELF"}
                    onCheckedChange={(c) => c && changeShelfStage(o.value as "MAU_ME" | "THANH_PHAM")}
                  />
                  <span className="text-sm text-foreground">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Quy cách *</Label>
            <Select
              items={STAGE_CODE_OPTIONS[shelfStage]}
              value={shelfStageCode}
              onValueChange={(v) => setShelfStageCode(v as string)}
              disabled={destination !== "SHELF"}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_CODE_OPTIONS[shelfStage].map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Giàn kệ * {loadingShelves && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}</Label>
            <Combobox
              items={shelfOptions}
              value={shelfOptions.find((o) => o.value === shelfId) ?? null}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => setShelfId(v ? (v as ComboOption).value : "")}
              disabled={destination !== "SHELF" || !plantTypeId || loadingShelves}
            >
              <ComboboxInputGroup className="w-full h-11 md:h-8">
                <ComboboxInput placeholder={plantTypeId ? "Gõ mã giàn kệ…" : "Chọn mã cây trước"} />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không có giàn kệ nào phù hợp mã cây này</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item} disabled={item.disabled}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            {shelfStage === "MAU_ME" && (
              <p className="text-xs text-text-secondary">
                Chỉ đề xuất kệ đang chứa sẵn mã cây này, hoặc kệ mẫu mẹ chung còn trống và chưa gắn NV.
              </p>
            )}
          </div>
        </div>

        {/* Khối Phòng tối — mờ đi khi đang chọn Phòng sáng */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-divider p-3 transition-opacity ${destination === "SHELF" ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="space-y-1">
            <Label>Quy cách *</Label>
            <Select
              items={DARK_ROOM_STAGE_CODE_OPTIONS}
              value={darkRoomStageCode}
              onValueChange={(v) => setDarkRoomStageCode(v as string)}
              disabled={destination !== "DARK_ROOM"}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DARK_ROOM_STAGE_CODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>NV cấy mô * {loadingStaff && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}</Label>
            <Combobox
              items={staffOptions}
              value={staffOptions.find((o) => o.value === staffId) ?? null}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => setStaffId(v ? (v as ComboOption).value : "")}
              disabled={destination !== "DARK_ROOM" || loadingStaff}
            >
              <ComboboxInputGroup className="w-full h-11 md:h-8">
                <ComboboxInput placeholder="Gõ mã hoặc tên NV…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không có NV cấy mô nào ở kho này</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <p className="text-xs text-text-secondary">Lô sẽ gắn thẳng vào Phòng tối cá nhân của đúng NV chọn ở đây.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <Label>Kiểu nhập *</Label>
            <Select items={MODE_OPTIONS} value={mode} onValueChange={(v) => setMode(v as "ADD" | "REPLACE")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs text-text-secondary">
              {mode === "ADD"
                ? "Nếu nơi nhập đã có sẵn lô cùng mã cây + quy cách, số nhập sẽ CỘNG THÊM vào lô đó."
                : "Nếu nơi nhập đã có sẵn lô cùng mã cây + quy cách, số lượng lô đó sẽ được GHI ĐÈ thành đúng số vừa nhập (dùng khi kiểm kê ra số thực tế)."}
            </p>
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
