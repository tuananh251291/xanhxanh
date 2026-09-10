"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock, ChevronDown, ChevronRight, Download } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";

type Warehouse = { id: string; code: string; name: string };
type DailyDetailEntry = {
  date: string; active: boolean; handedOverQuantity: number; recordedQuantity: number;
  unqualifiedQuantity: number; contaminatedQuantity: number;
};
type PlantTypeBreakdown = {
  plantTypeId: string; plantTypeCode: string; plantTypeName: string;
  handedOverQuantity: number; recordedQuantity: number; contaminatedQuantity: number;
};
type Row = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  lane: "XANH" | "VANG" | "DO" | null;
  totalHandedOverQuantity: number;
  totalRecordedQuantity: number;
  totalUnqualifiedQuantity: number;
  totalContaminatedQuantity: number;
  hasPending: boolean;
  byPlantType: PlantTypeBreakdown[];
  dailyDetail: DailyDetailEntry[];
};
type Summary = { totalHandedOver: number; totalRecorded: number; staffCount: number };

const ALL_WAREHOUSE = "ALL";
const num = (n: number) => n.toLocaleString("vi-VN");

export default function HandoverSummaryBoard({ warehouses }: { warehouses: Warehouse[] }) {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/handover-summary?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const overallPct = summary && summary.totalHandedOver > 0
    ? Math.round((summary.totalRecorded / summary.totalHandedOver) * 1000) / 10
    : 0;
  const selectedWarehouse = warehouseId !== ALL_WAREHOUSE ? warehouses.find((w) => w.id === warehouseId) : null;

  const exportParams = new URLSearchParams({ dateFrom, dateTo });
  if (warehouseId !== ALL_WAREHOUSE) exportParams.set("warehouseId", warehouseId);
  const exportHref = `/api/reports/handover-summary/export?${exportParams}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Từ ngày</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Đến ngày</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cơ sở sản xuất</Label>
            <Select
              items={[{ value: ALL_WAREHOUSE, label: "Tất cả cơ sở" }, ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
              value={warehouseId}
              onValueChange={(v) => setWarehouseId((v as string) ?? ALL_WAREHOUSE)}
            >
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WAREHOUSE}>Tất cả cơ sở</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <a href={exportHref} className="ml-auto">
            <Button type="button" className="bg-primary hover:bg-primary-hover">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Xuất Excel
            </Button>
          </a>
        </CardContent>
      </Card>

      {selectedWarehouse && (
        <p className="text-sm text-text-secondary">
          Bạn đang xem cơ sở <strong className="text-foreground">{selectedWarehouse.name} ({selectedWarehouse.code})</strong>.
        </p>
      )}

      {summary && (
        <p className="text-sm text-text-secondary">
          {summary.staffCount} NV cấy mô · Tổng bàn giao: <strong className="text-foreground">{num(summary.totalHandedOver)}</strong>
          {" "}· Tổng ghi nhận: <strong className="text-primary-strong">{num(summary.totalRecorded)}</strong>
          {" "}· Tỉ lệ ghi nhận chung: <strong>{overallPct}%</strong>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có NV cấy mô nào khớp bộ lọc</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-2 py-3 text-primary-strong font-bold text-base"></th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Luồng</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL bàn giao</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL nhiễm</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ nhiễm</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">SL ghi nhận</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded === r.staffId;
                    const pct = r.totalHandedOverQuantity > 0 ? Math.round((r.totalRecordedQuantity / r.totalHandedOverQuantity) * 1000) / 10 : 0;
                    // Mẫu số = SL bàn giao (đã trừ nhiễm) + SL nhiễm = số GỐC trước khi Kho mô trừ hàng
                    // nhiễm lúc kiểm tra — giống cách tính ở inspect-form.tsx.
                    const originalHandedOver = r.totalHandedOverQuantity + r.totalContaminatedQuantity;
                    const contaminationPct = originalHandedOver > 0 ? Math.round((r.totalContaminatedQuantity / originalHandedOver) * 1000) / 10 : 0;
                    return (
                      <Fragment key={r.staffId}>
                        <tr
                          className="border-b last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                          onClick={() => setExpanded(isOpen ? null : r.staffId)}
                        >
                          <td className="px-2 py-3 text-text-muted">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                          <td className="px-4 py-3 font-medium text-foreground">{r.staffName}</td>
                          <td className="px-4 py-3">
                            {r.lane ? (
                              <Badge className={INSPECTION_LANE_COLORS[r.lane]}>
                                {INSPECTION_LANE_LABELS[r.lane]}
                              </Badge>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{num(r.totalHandedOverQuantity)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-destructive">{num(r.totalContaminatedQuantity)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-destructive">{contaminationPct}%</td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums text-primary-strong">
                            {num(r.totalRecordedQuantity)}
                            {r.hasPending && (
                              <span className="inline-flex items-center gap-1 text-warning-foreground text-xs ml-1.5 font-normal">
                                <Clock className="w-3 h-3" /> còn phiếu chờ kiểm tra
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-bold tabular-nums">{pct}%</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background border-b">
                            <td colSpan={9} className="px-6 py-4">
                              {r.byPlantType.length > 0 && (
                                <div className="mb-4">
                                  <p className="text-text-muted text-xs mb-2">Theo mã cây (bàn giao / nhiễm / ghi nhận)</p>
                                  <div className="flex flex-wrap gap-2">
                                    {r.byPlantType.map((p) => (
                                      <Badge key={p.plantTypeId} className="bg-info-light text-info-foreground">
                                        {p.plantTypeCode} — {p.plantTypeName}: {num(p.handedOverQuantity)} / {num(p.contaminatedQuantity)} / {num(p.recordedQuantity)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <p className="text-text-muted text-xs mb-2">Chi tiết bàn giao & ghi nhận theo ngày trong khoảng đã chọn</p>
                              <div className="max-h-72 overflow-y-auto border border-divider rounded-md">
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-primary-light">
                                    <tr>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Ngày</th>
                                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Trạng thái</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL bàn giao</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL nhiễm</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL ghi nhận</th>
                                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL không đạt</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.dailyDetail.map((d) => (
                                      <tr key={d.date} className="border-t border-divider even:bg-background odd:bg-card">
                                        <td className="px-3 py-1.5 tabular-nums">
                                          {format(new Date(`${d.date}T00:00:00`), "dd/MM/yyyy")}
                                        </td>
                                        <td className="px-3 py-1.5">
                                          {d.active ? (
                                            <Badge className="bg-success-light text-success-foreground">Có bàn giao</Badge>
                                          ) : (
                                            <Badge className="bg-danger-light text-destructive">Không có</Badge>
                                          )}
                                        </td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(d.handedOverQuantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(d.contaminatedQuantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(d.recordedQuantity)}</td>
                                        <td className="px-3 py-1.5 text-right tabular-nums">{num(d.unqualifiedQuantity)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
