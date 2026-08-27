"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { Loader2 } from "lucide-react";
import { getISOWeek, getISOWeekYear, subWeeks } from "date-fns";

type PlantType = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type GrowthRow = {
  plantTypeId: string;
  code: string;
  name: string;
  startBalance: number;
  endBalance: number;
  remainingHandedOver: number;
  sentToOtherFacilities: number;
  growth: number;
};

const ALL_PLANT_TYPE: ComboOption = { value: "ALL", label: "Tất cả mã cây" };

function dateToIsoWeekValue(date: Date): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function fmt(n: number): string {
  return n.toLocaleString("vi-VN");
}

export default function MotherStockGrowthBoard() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);

  const [warehouseId, setWarehouseId] = useState("");
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption>(ALL_PLANT_TYPE);
  const [fromWeek, setFromWeek] = useState(() => dateToIsoWeekValue(subWeeks(new Date(), 4)));
  const [toWeek, setToWeek] = useState(() => dateToIsoWeekValue(new Date()));

  const [rows, setRows] = useState<GrowthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/warehouses?type=SAN_XUAT").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : [];
      setWarehouses(list);
      setWarehouseId((prev) => prev || list[0]?.id || "");
    });
    fetch("/api/plant-types").then((r) => r.json()).then((d) => setPlantTypes(Array.isArray(d) ? d : []));
  }, []);

  const plantTypeOptions = useMemo(
    () => [ALL_PLANT_TYPE, ...plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))],
    [plantTypes]
  );

  const load = useCallback(async () => {
    if (!warehouseId || !fromWeek || !toWeek) { setRows([]); return; }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ warehouseId, fromWeek, toWeek });
      if (plantTypeOption.value !== "ALL") params.set("plantTypeId", plantTypeOption.value);
      const res = await fetch(`/api/reports/mother-stock-growth?${params}`);
      const data = await res.json();
      if (!res.ok) { setError(data?.message ?? "Không tải được báo cáo"); setRows([]); return; }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, plantTypeOption, fromWeek, toWeek]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          startBalance: acc.startBalance + r.startBalance,
          endBalance: acc.endBalance + r.endBalance,
          remainingHandedOver: acc.remainingHandedOver + r.remainingHandedOver,
          sentToOtherFacilities: acc.sentToOtherFacilities + r.sentToOtherFacilities,
          growth: acc.growth + r.growth,
        }),
        { startBalance: 0, endBalance: 0, remainingHandedOver: 0, sentToOtherFacilities: 0, growth: 0 }
      ),
    [rows]
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Cơ sở sản xuất</Label>
            <Select
              items={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
              value={warehouseId}
              onValueChange={(v) => setWarehouseId((v as string) ?? "")}
            >
              <SelectTrigger className="w-56"><SelectValue placeholder="Chọn cơ sở…" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mã cây</Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => setPlantTypeOption((v as ComboOption) ?? ALL_PLANT_TYPE)}
            >
              <ComboboxInputGroup className="w-64 h-9">
                <ComboboxInput placeholder="Chọn mã cây…" />
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
            <Label className="text-xs">Từ tuần</Label>
            <Input type="week" value={fromWeek} onChange={(e) => setFromWeek(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến tuần</Label>
            <Input type="week" value={toWeek} onChange={(e) => setToWeek(e.target.value)} className="w-40" />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Không có dữ liệu mẫu mẹ trong khoảng đã chọn</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-primary-strong">
                  <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Tồn đầu kỳ</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Tồn cuối kỳ</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Đã bàn giao, chưa cấy hết</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Đã chuyển cơ sở khác</th>
                  <th className="px-3 py-2 text-center font-bold text-base">Gia tăng</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.plantTypeId} className="border-b last:border-0 even:bg-primary-light">
                    <td className="px-3 py-2 font-medium">{r.code} — {r.name}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(r.startBalance)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(r.endBalance)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(r.remainingHandedOver)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(r.sentToOtherFacilities)}</td>
                    <td className="px-3 py-2 text-center tabular-nums font-bold text-primary-strong">{fmt(r.growth)}</td>
                  </tr>
                ))}
                {rows.length > 1 && (
                  <tr className="border-t-2 border-border font-bold">
                    <td className="px-3 py-2">Tổng</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(total.startBalance)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(total.endBalance)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(total.remainingHandedOver)}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(total.sentToOtherFacilities)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-primary-strong">{fmt(total.growth)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
