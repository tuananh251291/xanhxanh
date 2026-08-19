"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock } from "lucide-react";
import { format } from "date-fns";
import { INSPECTION_LANE_LABELS } from "@/types";

type Warehouse = { id: string; code: string; name: string };
type Row = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  lane: "XANH" | "DO" | null;
  handedOverQuantity: number;
  recordedQuantity: number;
  hasPending: boolean;
};
type Summary = { totalHandedOver: number; totalRecorded: number; staffCount: number };

const ALL_WAREHOUSE = "ALL";

export default function HandoverSummaryBoard({ warehouses }: { warehouses: Warehouse[] }) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/handover-summary?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
      if (data.rangeStart && data.rangeEnd) {
        const rangeEndDisplay = new Date(new Date(data.rangeEnd).getTime() - 24 * 60 * 60 * 1000);
        setRangeLabel(`${format(new Date(data.rangeStart), "dd/MM/yyyy")} — ${format(rangeEndDisplay, "dd/MM/yyyy")}`);
      }
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const overallPct = summary && summary.totalHandedOver > 0
    ? Math.round((summary.totalRecorded / summary.totalHandedOver) * 1000) / 10
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Kỳ lương (theo tháng chọn)</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cơ sở sản xuất</Label>
            <Select value={warehouseId} onValueChange={(v) => setWarehouseId((v as string) ?? ALL_WAREHOUSE)}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WAREHOUSE}>Tất cả cơ sở</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
              </SelectContent>
            </Select>
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
          {summary.staffCount} NV cấy mô · Tổng bàn giao: <strong className="text-foreground">{summary.totalHandedOver.toLocaleString("vi-VN")}</strong>
          {" "}· Tổng ghi nhận: <strong className="text-primary-strong">{summary.totalRecorded.toLocaleString("vi-VN")}</strong>
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
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên NV</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Luồng</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng bàn giao</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng được ghi nhận</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pct = r.handedOverQuantity > 0 ? Math.round((r.recordedQuantity / r.handedOverQuantity) * 1000) / 10 : 0;
                    return (
                      <tr key={r.staffId} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                        <td className="px-4 py-3 font-medium text-foreground">{r.staffName}</td>
                        <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                        <td className="px-4 py-3">
                          {r.lane ? (
                            <Badge className={r.lane === "XANH" ? "bg-primary-light text-primary-strong" : "bg-danger-light text-destructive"}>
                              {INSPECTION_LANE_LABELS[r.lane]}
                            </Badge>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.handedOverQuantity.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {r.recordedQuantity.toLocaleString("vi-VN")}
                          {r.hasPending && (
                            <span className="inline-flex items-center gap-1 text-warning-foreground text-xs ml-1.5">
                              <Clock className="w-3 h-3" /> còn phiếu chờ kiểm tra
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums">{pct}%</td>
                      </tr>
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
