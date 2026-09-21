"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import PlantTypeMultiFilter from "@/components/shared/plant-type-multi-filter";
import { Loader2, X, ListChecks } from "lucide-react";
import { endOfMonth, format as formatDate } from "date-fns";
import ReportBarChart from "./charts/report-bar-chart";

type PlantType = { id: string; code: string; name: string };
type Warehouse = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type Unit = "week" | "month";
type Scope = "all" | "warehouse";

type PeriodRow = { period: string; "Kế hoạch": number; "Thực tế": number };
// 1 dòng = 1 NV cấy mô + 1 mã cây (NV làm nhiều mã cây thì có nhiều dòng riêng, xem StaffBreakdownTable).
type StaffRow = {
  staffId: string; code: string; name: string;
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  actual: number; plan: number; percentOfPlan: number | null;
};
type ReportData = { data: PeriodRow[]; totalPlan: number; totalActual: number; percentAchieved: number | null; staffBreakdown: StaffRow[] };

// Trước đây phải chọn 2 mốc "Từ kỳ/Đến kỳ" (cùng dạng tuần hoặc tháng tuỳ Đơn vị thời gian) khá rối —
// giờ chỉ chọn ĐÚNG 1 tháng dương lịch cần xem (input type="month", không đổi theo Đơn vị thời gian nữa),
// server tự bao trọn từ ngày 1 đến ngày cuối tháng đó — Đơn vị thời gian giờ chỉ còn quyết định độ chi
// tiết hiển thị TRONG tháng đó (theo tuần ra ~4-5 dòng, theo tháng ra đúng 1 dòng).
function monthValueToRange(value: string): { from: string; to: string } | null {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const monthStart = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return { from: formatDate(monthStart, "yyyy-MM-dd"), to: formatDate(endOfMonth(monthStart), "yyyy-MM-dd") };
}

function percentColorClass(pct: number | null): string {
  if (pct === null) return "text-text-muted";
  if (pct >= 100) return "text-success-foreground";
  if (pct >= 70) return "text-warning-foreground";
  return "text-destructive";
}

function fmt(n: number): string {
  return n.toLocaleString("vi-VN");
}

export default function PlanVsActualReport() {
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [unit, setUnit] = useState<Unit>("week");
  const [selectedPlantTypeIds, setSelectedPlantTypeIds] = useState<string[]>([]);
  const [scope, setScope] = useState<Scope>("all");
  const [warehouseOption, setWarehouseOption] = useState<ComboOption | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetch("/api/plant-types").then((r) => r.json()).then((d) => setPlantTypes(Array.isArray(d) ? d : []));
    fetch("/api/warehouses?type=SAN_XUAT").then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : []));
  }, []);

  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);

  const load = useCallback(async () => {
    if (scope === "warehouse" && !warehouseOption) { setReport(null); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ unit, scope });
      if (scope === "warehouse" && warehouseOption) params.set("warehouseId", warehouseOption.value);
      if (selectedPlantTypeIds.length > 0) params.set("plantTypeIds", selectedPlantTypeIds.join(","));
      const range = monthValueToRange(selectedMonth);
      if (range) { params.set("from", range.from); params.set("to", range.to); }
      const res = await fetch(`/api/reports/rooting-plan-vs-actual?${params}`);
      const json = await res.json();
      setReport(json);
    } finally {
      setLoading(false);
    }
  }, [unit, selectedPlantTypeIds, scope, warehouseOption, selectedMonth]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kế hoạch vs thực tế — cây ra rễ</CardTitle>
        <p className="text-sm text-text-secondary">
          Kế hoạch lấy từ nhiệm vụ tháng &quot;Dự kiến đáp ứng cây ra rễ&quot; NV Kỹ thuật đã nhập (xem
          theo tuần thì lấy kế hoạch tháng chia 4). Thực tế là sản lượng thành phẩm đã cấy ra.
        </p>

        <div className="flex items-end gap-2 flex-wrap pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Đơn vị thời gian</Label>
            <Select
              items={[{ value: "week", label: "Tuần" }, { value: "month", label: "Tháng" }]}
              value={unit}
              onValueChange={(v) => setUnit(v as Unit)}
            >
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Tuần</SelectItem>
                <SelectItem value="month">Tháng</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Chọn tháng</Label>
            <div className="flex items-center gap-1">
              <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-40" />
              {selectedMonth && (
                <Button
                  type="button" variant="ghost" size="icon-sm"
                  title="Bỏ chọn — dùng mặc định 10 kỳ gần nhất"
                  onClick={() => setSelectedMonth("")}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mã cây</Label>
            <PlantTypeMultiFilter plantTypes={plantTypes} selectedIds={selectedPlantTypeIds} onChange={setSelectedPlantTypeIds} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Phạm vi</Label>
            <Select
              items={[{ value: "all", label: "Toàn hệ thống" }, { value: "warehouse", label: "Theo cơ sở sản xuất" }]}
              value={scope}
              onValueChange={(v) => { setScope(v as Scope); setWarehouseOption(null); }}
            >
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toàn hệ thống</SelectItem>
                <SelectItem value="warehouse">Theo cơ sở sản xuất</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "warehouse" && (
            <div className="space-y-1">
              <Label className="text-xs">Cơ sở sản xuất</Label>
              <Combobox
                items={warehouseOptions}
                value={warehouseOption}
                isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
                onValueChange={setWarehouseOption}
              >
                <ComboboxInputGroup className="w-56 h-9">
                  <ComboboxInput placeholder="Chọn cơ sở…" />
                  <ComboboxTrigger />
                </ComboboxInputGroup>
                <ComboboxContent>
                  <ComboboxEmpty>Không tìm thấy cơ sở</ComboboxEmpty>
                  <ComboboxList>
                    {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : !report ? (
          <p className="text-sm text-text-muted text-center py-12">Chọn cơ sở sản xuất để xem báo cáo</p>
        ) : (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <p className="text-sm text-text-secondary">
                Kế hoạch: <strong className="text-foreground">{fmt(report.totalPlan)}</strong>
                {" "}· Thực tế: <strong className="text-foreground">{fmt(report.totalActual)}</strong>
                {" "}· % đạt: <strong className={percentColorClass(report.percentAchieved)}>
                  {report.percentAchieved === null ? "—" : `${report.percentAchieved}%`}
                </strong>
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => setDetailOpen(true)}>
                <ListChecks className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
              </Button>
            </div>

            <ReportBarChart
              data={report.data}
              xKey="period"
              series={[
                { key: "Kế hoạch", label: "Kế hoạch", color: "#2a78d6" },
                { key: "Thực tế", label: "Thực tế", color: "#eb6834" },
              ]}
            />

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-primary-strong">
                    <th className="px-3 py-2 text-left font-bold text-base">Kỳ</th>
                    <th className="px-3 py-2 text-center font-bold text-base">Kế hoạch</th>
                    <th className="px-3 py-2 text-center font-bold text-base">Thực tế</th>
                    <th className="px-3 py-2 text-center font-bold text-base">% đạt</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.map((r) => {
                    const pct = r["Kế hoạch"] > 0 ? Math.round((r["Thực tế"] / r["Kế hoạch"]) * 1000) / 10 : null;
                    return (
                      <tr key={r.period} className="border-b last:border-0 even:bg-primary-light">
                        <td className="px-3 py-2 font-medium">{r.period}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmt(r["Kế hoạch"])}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{fmt(r["Thực tế"])}</td>
                        <td className={`px-3 py-2 text-center tabular-nums font-semibold ${percentColorClass(pct)}`}>
                          {pct === null ? "—" : `${pct}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
              <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Chi tiết theo nhân sự</DialogTitle>
                </DialogHeader>
                {report.staffBreakdown.length === 0 ? (
                  <p className="text-sm text-text-muted py-4">Không có NV cấy mô nào sản xuất trong khoảng đã chọn</p>
                ) : (
                  // Danh sách dài (nhiều NV) xếp dọc 1 bảng 4 cột trong dialog hẹp trước đây rất dài, phải
                  // cuộn nhiều — nay dialog rộng hơn nên tách đôi thành 2 bảng 4 cột cạnh nhau (gộp lại
                  // thành 8 cột hiển thị), nửa đầu danh sách bên trái, nửa sau bên phải, dễ nhìn hơn hẳn so
                  // với 1 cột dài lê thê. Ít NV (≤6) thì không cần tách, giữ 1 bảng cho gọn.
                  (() => {
                    const staff = report.staffBreakdown;
                    if (staff.length <= 6) return <StaffBreakdownTable staff={staff} />;
                    const half = Math.ceil(staff.length / 2);
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <StaffBreakdownTable staff={staff.slice(0, half)} />
                        <StaffBreakdownTable staff={staff.slice(half)} />
                      </div>
                    );
                  })()
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Dùng chung cho dialog "Chi tiết theo nhân sự" — cho phép hiện 1 hoặc 2 bảng cạnh nhau (xem chỗ gọi).
// Cột "Kế hoạch" hiện đúng phần dự kiến NV Kỹ thuật đã giao RIÊNG cho từng (NV cấy mô, mã cây) — 1 NV làm
// nhiều mã cây thì tách thành nhiều dòng, không gộp chung (assignedStaffId + plantTypeId ở
// RootingForecastEntry, xem route.ts) — KHÔNG phải tổng kế hoạch chung của cả kỳ.
function StaffBreakdownTable({ staff }: { staff: StaffRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light text-primary-strong">
            <th className="px-3 py-2 text-left font-bold text-base">Mã NV</th>
            <th className="px-3 py-2 text-left font-bold text-base">Tên NV</th>
            <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
            <th className="px-3 py-2 text-center font-bold text-base">Kế hoạch</th>
            <th className="px-3 py-2 text-center font-bold text-base">Thực tế</th>
            <th className="px-3 py-2 text-center font-bold text-base">% đáp ứng</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={`${s.staffId}-${s.plantTypeId}`} className="border-b last:border-0 even:bg-primary-light">
              <td className="px-3 py-2 font-mono">{s.code}</td>
              <td className="px-3 py-2">{s.name}</td>
              <td className="px-3 py-2" title={s.plantTypeName}>{s.plantTypeCode}</td>
              <td className="px-3 py-2 text-center tabular-nums text-text-secondary">{fmt(s.plan)}</td>
              <td className="px-3 py-2 text-center tabular-nums">{fmt(s.actual)}</td>
              <td className={`px-3 py-2 text-center tabular-nums font-semibold ${percentColorClass(s.percentOfPlan)}`}>
                {s.percentOfPlan === null ? "—" : `${s.percentOfPlan}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
