"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Warehouse = { id: string; code: string; name: string };
type PlantType = { id: string; code: string; name: string };
type ComboOption = { value: string; label: string };
type Period = "all" | "month";

type Row = {
  id: string;
  code: string;
  createdAt: string;
  firstRecordDate: string | null;
  plantType: { code: string; name: string };
  assignedTo: { code: string; name: string } | null;
  inputMotherQuantity: number;
  expectedMotherOutput: number | null;
  expectedFinishedOutput: number | null;
  actualMotherOutput: number;
  actualFinishedOutput: number;
};
type Totals = {
  inputMotherQuantity: number;
  expectedMotherOutput: number;
  expectedFinishedOutput: number;
  actualMotherOutput: number;
  actualFinishedOutput: number;
};
type CodeOption = { id: string; code: string; plantTypeCode: string };
type ReportData = { rows: Row[]; totals: Totals; codeOptions: CodeOption[]; truncated: boolean };

const ALL_WAREHOUSE = "ALL";
const ALL_PLANT_TYPE: ComboOption = { value: "ALL", label: "Tất cả loại cây" };

function fmt(n: number): string {
  return n.toLocaleString("vi-VN");
}

function pct(actual: number, expected: number | null): number | null {
  if (expected === null || expected <= 0) return null;
  return Math.round((actual / expected) * 1000) / 10;
}

function pctColorClass(p: number | null): string {
  if (p === null) return "text-text-muted";
  if (p >= 100) return "text-success-foreground";
  if (p >= 70) return "text-warning-foreground";
  return "text-destructive";
}

// Tab "Dữ liệu chỉ định cấy" ở /reports (Admin/Admin cấp cao + NV Kỹ thuật) — mỗi chỉ định hiện 2 dòng
// trên/dưới: dòng "Chỉ định" (kỳ vọng KY_THUAT đã tính lúc tạo) và dòng "Thực tế" (cộng dồn nhật ký cấy
// của toàn bộ chỉ định đó, không lọc theo ngày cấy — chỉ lọc THỜI ĐIỂM TẠO chỉ định theo tháng/toàn bộ
// thời gian) để so cùng 1 cột số cho dễ nhìn — xem GET /api/reports/instruction-plan-vs-actual.
export default function InstructionPlanVsActualReport() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [plantTypes, setPlantTypes] = useState<PlantType[]>([]);

  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [plantTypeOption, setPlantTypeOption] = useState<ComboOption>(ALL_PLANT_TYPE);
  const [period, setPeriod] = useState<Period>("all");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [codeOption, setCodeOption] = useState<ComboOption | null>(null);

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/warehouses?type=SAN_XUAT").then((r) => r.json()).then((d) => setWarehouses(Array.isArray(d) ? d : []));
    fetch("/api/plant-types").then((r) => r.json()).then((d) => setPlantTypes(Array.isArray(d) ? d : []));
  }, []);

  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })), [warehouses]);
  const plantTypeOptions = useMemo(
    () => [ALL_PLANT_TYPE, ...plantTypes.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))],
    [plantTypes]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      if (plantTypeOption.value !== "ALL") params.set("plantTypeId", plantTypeOption.value);
      if (period === "month") params.set("month", month);
      if (codeOption) params.set("instructionId", codeOption.value);
      const res = await fetch(`/api/reports/instruction-plan-vs-actual?${params}`);
      const json = await res.json();
      setReport(json);
      // Mã chỉ định đang chọn không còn nằm trong danh sách gợi ý mới (đổi khu/loại cây/kỳ) — bỏ chọn để
      // tránh kết quả rỗng gây khó hiểu, giống idiom auto-reset ở planting-log-summary-board.tsx.
      if (codeOption && Array.isArray(json.codeOptions) && !json.codeOptions.some((c: CodeOption) => c.id === codeOption.value)) {
        setCodeOption(null);
      }
    } finally {
      setLoading(false);
    }
  }, [warehouseId, plantTypeOption, period, month, codeOption]);

  useEffect(() => { load(); }, [load]);

  const codeOptionItems: ComboOption[] = useMemo(
    () => (report?.codeOptions ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.plantTypeCode}` })),
    [report?.codeOptions]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Dữ liệu chỉ định cấy</CardTitle>
        <p className="text-sm text-text-secondary">
          So sánh số kỳ vọng (chỉ định) với số thực tế NV cấy mô đã cấy ra — mỗi chỉ định 2 dòng: &quot;Chỉ
          định&quot; ở trên, &quot;Thực tế&quot; ở dưới.
        </p>

        <div className="flex items-end gap-2 flex-wrap pt-2">
          <div className="space-y-1">
            <Label className="text-xs">Khu sản xuất</Label>
            <Select
              items={[{ value: ALL_WAREHOUSE, label: "Tất cả khu sản xuất" }, ...warehouseOptions]}
              value={warehouseId}
              onValueChange={(v) => setWarehouseId(v as string)}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WAREHOUSE}>Tất cả khu sản xuất</SelectItem>
                {warehouseOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Loại cây</Label>
            <Combobox
              items={plantTypeOptions}
              value={plantTypeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => setPlantTypeOption((v as ComboOption) ?? ALL_PLANT_TYPE)}
            >
              <ComboboxInputGroup className="w-56 h-9">
                <ComboboxInput placeholder="Gõ mã hoặc tên cây…" />
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
            <Label className="text-xs">Thời gian</Label>
            <Select
              items={[{ value: "all", label: "Toàn bộ thời gian" }, { value: "month", label: "Theo tháng" }]}
              value={period}
              onValueChange={(v) => setPeriod(v as Period)}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toàn bộ thời gian</SelectItem>
                <SelectItem value="month">Theo tháng</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "month" && (
            <div className="space-y-1">
              <Label className="text-xs">Tháng</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Tìm mã chỉ định</Label>
            <Combobox
              items={codeOptionItems}
              value={codeOption}
              isItemEqualToValue={(a: ComboOption, b: ComboOption) => a.value === b.value}
              onValueChange={(v) => setCodeOption((v as ComboOption) ?? null)}
            >
              <ComboboxInputGroup className="w-56 h-9">
                <ComboboxInput placeholder="Gõ mã chỉ định…" />
                <ComboboxTrigger />
              </ComboboxInputGroup>
              <ComboboxContent>
                <ComboboxEmpty>Không tìm thấy chỉ định</ComboboxEmpty>
                <ComboboxList>
                  {(item: ComboOption) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
        ) : !report || report.rows.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-12">Không có chỉ định nào khớp bộ lọc</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-secondary mb-4">
              <span>
                Mẫu mẹ — kỳ vọng: <strong className="text-foreground">{fmt(report.totals.expectedMotherOutput)}</strong>
                {" "}· thực tế: <strong className="text-foreground">{fmt(report.totals.actualMotherOutput)}</strong>
                {" "}· % đạt:{" "}
                <strong className={pctColorClass(pct(report.totals.actualMotherOutput, report.totals.expectedMotherOutput))}>
                  {pct(report.totals.actualMotherOutput, report.totals.expectedMotherOutput) ?? "—"}
                  {pct(report.totals.actualMotherOutput, report.totals.expectedMotherOutput) !== null ? "%" : ""}
                </strong>
              </span>
              <span>
                Thành phẩm — kỳ vọng: <strong className="text-foreground">{fmt(report.totals.expectedFinishedOutput)}</strong>
                {" "}· thực tế: <strong className="text-foreground">{fmt(report.totals.actualFinishedOutput)}</strong>
                {" "}· % đạt:{" "}
                <strong className={pctColorClass(pct(report.totals.actualFinishedOutput, report.totals.expectedFinishedOutput))}>
                  {pct(report.totals.actualFinishedOutput, report.totals.expectedFinishedOutput) ?? "—"}
                  {pct(report.totals.actualFinishedOutput, report.totals.expectedFinishedOutput) !== null ? "%" : ""}
                </strong>
              </span>
              <span>Đang hiển thị: <strong className="text-foreground">{report.rows.length}</strong> chỉ định{report.truncated ? " (đã giới hạn 300, thu hẹp bộ lọc để xem đủ)" : ""}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light text-primary-strong">
                    <th className="px-3 py-2 text-left font-bold text-base">Chỉ định</th>
                    <th className="px-3 py-2 text-left font-bold text-base">Mã cây</th>
                    <th className="px-3 py-2 text-left font-bold text-base">Ngày</th>
                    <th className="px-3 py-2 text-left font-bold text-base">Dòng</th>
                    <th className="px-3 py-2 text-center font-bold text-base">SL mẫu mẹ</th>
                    <th className="px-3 py-2 text-center font-bold text-base">SL thành phẩm</th>
                    <th className="px-3 py-2 text-center font-bold text-base">% đạt MM</th>
                    <th className="px-3 py-2 text-center font-bold text-base">% đạt TP</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => {
                    const motherPct = pct(r.actualMotherOutput, r.expectedMotherOutput);
                    const finishedPct = pct(r.actualFinishedOutput, r.expectedFinishedOutput);
                    return (
                      <Fragment key={r.id}>
                        <tr className="border-t-2 border-divider">
                          <td className="px-3 py-2" rowSpan={2}>
                            <div className="font-medium">{r.code}</div>
                            <div className="text-xs text-text-secondary">{r.assignedTo ? `${r.assignedTo.code} — ${r.assignedTo.name}` : "—"}</div>
                          </td>
                          <td className="px-3 py-2" rowSpan={2}>{r.plantType.code}</td>
                          <td className="px-3 py-2" rowSpan={2}>
                            <div>{new Date(r.createdAt).toLocaleDateString("vi-VN")}</div>
                            <div className="text-xs text-text-secondary">{r.firstRecordDate ? new Date(r.firstRecordDate).toLocaleDateString("vi-VN") : "—"}</div>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">Chỉ định</td>
                          <td className="px-3 py-2 text-center tabular-nums">{r.expectedMotherOutput === null ? "—" : fmt(r.expectedMotherOutput)}</td>
                          <td className="px-3 py-2 text-center tabular-nums">{r.expectedFinishedOutput === null ? "—" : fmt(r.expectedFinishedOutput)}</td>
                          <td className="px-3 py-2 text-center text-text-muted">—</td>
                          <td className="px-3 py-2 text-center text-text-muted">—</td>
                        </tr>
                        <tr className="bg-primary-light/40">
                          <td className="px-3 py-2 font-semibold">Thực tế</td>
                          <td className="px-3 py-2 text-center tabular-nums font-semibold">{fmt(r.actualMotherOutput)}</td>
                          <td className="px-3 py-2 text-center tabular-nums font-semibold">{fmt(r.actualFinishedOutput)}</td>
                          <td className={`px-3 py-2 text-center tabular-nums font-semibold ${pctColorClass(motherPct)}`}>{motherPct === null ? "—" : `${motherPct}%`}</td>
                          <td className={`px-3 py-2 text-center tabular-nums font-semibold ${pctColorClass(finishedPct)}`}>{finishedPct === null ? "—" : `${finishedPct}%`}</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
