"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxInputGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import PlantTypeMultiFilter from "@/components/shared/plant-type-multi-filter";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

type Warehouse = { id: string; code: string; name: string };
type Staff = { id: string; code: string; name: string; workplaceWarehouseId: string | null };
type PlantType = { id: string; code: string; name: string };
type Row = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  recordCount: number;
  motherUsed: number;
  motherOut: number;
  finishedOut: number;
};
type Summary = { staffCount: number; totalMotherUsed: number; totalMotherOut: number; totalFinishedOut: number };
type ComboOption = { value: string; label: string };

const ALL = "ALL";

export default function PlantingLogSummaryBoard({
  warehouses, staffList, plantTypes,
}: {
  warehouses: Warehouse[];
  staffList: Staff[];
  plantTypes: PlantType[];
}) {
  const [mode, setMode] = useState<"week" | "month">("week");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(ALL);
  const [staffId, setStaffId] = useState(ALL);
  const [selectedPlantTypeIds, setSelectedPlantTypeIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");
  const [loading, setLoading] = useState(true);
  // Danh sách mã cây thực sự đã cấy đúng bộ lọc kho/nhân sự/thời gian hiện tại (server tính lại mỗi lần
  // load — xem availablePlantTypes ở API) — mặc định là toàn bộ mã cây đang hoạt động trước khi có dữ liệu.
  const [availablePlantTypes, setAvailablePlantTypes] = useState<PlantType[]>(plantTypes);

  // Đổi kho → nếu NV đang chọn không thuộc kho mới, bỏ chọn về "Tất cả NV" thay vì giữ lựa chọn không
  // còn khớp bộ lọc.
  const staffOptionsForWarehouse = useMemo(
    () => (warehouseId === ALL ? staffList : staffList.filter((s) => s.workplaceWarehouseId === warehouseId)),
    [staffList, warehouseId]
  );
  useEffect(() => {
    if (staffId !== ALL && !staffOptionsForWarehouse.some((s) => s.id === staffId)) setStaffId(ALL);
  }, [staffOptionsForWarehouse, staffId]);
  const staffOptions: ComboOption[] = staffOptionsForWarehouse.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }));

  // Mã cây đang chọn không còn nằm trong danh sách đã cấy thật (VD vừa đổi nhân sự/thời gian) → bỏ những
  // mã không còn khớp, giữ lại phần vẫn còn hợp lệ thay vì xoá sạch lựa chọn.
  useEffect(() => {
    setSelectedPlantTypeIds((prev) => {
      const filtered = prev.filter((id) => availablePlantTypes.some((p) => p.id === id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [availablePlantTypes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mode });
      if (mode === "week") params.set("date", date); else params.set("month", month);
      if (warehouseId !== ALL) params.set("warehouseId", warehouseId);
      if (staffId !== ALL) params.set("staffId", staffId);
      if (selectedPlantTypeIds.length > 0) params.set("plantTypeIds", selectedPlantTypeIds.join(","));
      const res = await fetch(`/api/reports/planting-log-summary?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
      setAvailablePlantTypes(Array.isArray(data.availablePlantTypes) ? data.availablePlantTypes : []);
      if (data.rangeStart && data.rangeEnd) {
        setRangeLabel(`${format(new Date(data.rangeStart), "dd/MM/yyyy")} — ${format(new Date(data.rangeEnd), "dd/MM/yyyy")}`);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, date, month, warehouseId, staffId, selectedPlantTypeIds]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Lọc theo</Label>
            <Select items={[{ value: "week", label: "Tuần" }, { value: "month", label: "Tháng" }]} value={mode} onValueChange={(v) => setMode(v as "week" | "month")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Tuần</SelectItem>
                <SelectItem value="month">Tháng</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "week" ? (
            <div className="space-y-1">
              <Label className="text-xs">Chọn 1 ngày trong tuần</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            </div>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">Tháng</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Khu sản xuất</Label>
            <Select
              items={[{ value: ALL, label: "Tất cả khu" }, ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
              value={warehouseId}
              onValueChange={(v) => setWarehouseId((v as string) ?? ALL)}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả khu</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nhân sự</Label>
            <Combobox
              items={staffOptions}
              value={staffOptions.find((o) => o.value === staffId) ?? null}
              isItemEqualToValue={(a, b) => a.value === b.value}
              onValueChange={(v) => setStaffId(v?.value ?? ALL)}
            >
              <ComboboxInputGroup className="w-56">
                <ComboboxInput placeholder="Tất cả NV — gõ để tìm tên…" />
                <ComboboxClear />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy NV</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mã cây</Label>
            <PlantTypeMultiFilter plantTypes={availablePlantTypes} selectedIds={selectedPlantTypeIds} onChange={setSelectedPlantTypeIds} />
          </div>
          {rangeLabel && (
            <p className="text-sm text-text-secondary">
              Kỳ đang xem: <strong className="text-foreground">{rangeLabel}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {summary && (
        <p className="text-sm text-text-secondary">
          {summary.staffCount} NV cấy mô · Mẫu mẹ sử dụng: <strong className="text-foreground">{summary.totalMotherUsed.toLocaleString("vi-VN")}</strong>
          {" "}· Ra mẫu mẹ: <strong className="text-primary-strong">{summary.totalMotherOut.toLocaleString("vi-VN")}</strong>
          {" "}· Ra thành phẩm: <strong className="text-primary-strong">{summary.totalFinishedOut.toLocaleString("vi-VN")}</strong>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có nhật ký cấy nào khớp bộ lọc</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Khu sản xuất</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số bản ghi</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Mẫu mẹ sử dụng</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Cấy ra mẫu mẹ</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Cấy ra thành phẩm</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.staffId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.staffName}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.recordCount}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.motherUsed.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-primary-strong">{r.motherOut.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-primary-strong">{r.finishedOut.toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
