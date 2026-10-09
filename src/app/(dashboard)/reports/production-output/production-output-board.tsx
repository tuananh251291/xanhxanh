"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";
import { cn } from "@/lib/utils";
import type { ProductionOutputRow } from "@/lib/production-output-report";

type Totals = { handedOverQuantity: number; recordedQuantity: number; contaminatedQuantity: number; amount: number };

const num = (n: number) => n.toLocaleString("vi-VN");
const pct = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

export default function ProductionOutputBoard() {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProductionOutputRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [missingPriceCount, setMissingPriceCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Gõ tìm kiếm → chờ 400ms mới lọc lại.
  useEffect(() => {
    const t = setTimeout(() => { if (qInput !== q) { setLoading(true); setQ(qInput); } }, 400);
    return () => clearTimeout(t);
  }, [qInput, q]);

  const params = useCallback(() => {
    const p = new URLSearchParams({ month });
    if (warehouseId) p.set("warehouseId", warehouseId);
    if (q.trim()) p.set("q", q.trim());
    return p;
  }, [month, warehouseId, q]);

  // Không tự bật loading ở đây (gọi từ effect) — chỗ đổi bộ lọc tự bật.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/reports/production-output?${params()}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Không tải được báo cáo"); return; }
      setRows(json.rows ?? []);
      setTotals(json.totals ?? null);
      setMissingPriceCount(json.missingPriceCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const staffCount = new Set(rows.map((r) => r.staffId)).size;
  const totalBase = totals ? totals.handedOverQuantity + totals.contaminatedQuantity : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Kỳ lương</Label>
            <Input type="month" value={month} onChange={(e) => { if (e.target.value) { setLoading(true); setMonth(e.target.value); } }} className="w-40" />
          </div>
          <WarehouseFilterSelect value={warehouseId} onChange={(v) => { setLoading(true); setWarehouseId(v); }} />
          <div className="space-y-1">
            <Label className="text-xs">Tìm NV / mã cây</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="VD NVCM203, MT011…" className="w-56 pl-8" />
            </div>
          </div>
          <a href={`/api/reports/production-output/export?${params()}`} className="ml-auto">
            <Button type="button"><Download className="w-4 h-4" /> Xuất Excel</Button>
          </a>
        </CardContent>
      </Card>

      {!loading && totals && rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "NV cấy mô", value: num(staffCount), tone: "text-foreground" },
            { label: "SL ghi nhận", value: num(totals.recordedQuantity), tone: "text-primary-strong" },
            { label: "Tỷ lệ nhiễm chung", value: pct(totalBase > 0 ? (totals.contaminatedQuantity / totalBase) * 100 : 0), tone: "text-warning-foreground" },
            { label: "Tổng thành tiền (VNĐ)", value: num(totals.amount), tone: "text-primary-strong" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="py-3">
                <p className="text-xs text-text-secondary">{s.label}</p>
                <p className={cn("text-xl font-bold", s.tone)}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && missingPriceCount > 0 && (
        <p className="text-sm rounded-lg bg-warning-light text-warning-foreground px-3 py-2">
          {missingPriceCount} dòng chưa có đơn giá (mã cây + quy cách chưa cài ở Cài đặt lương → Quy đổi sản lượng – KPI) — thành tiền đang tính 0.
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">Không có sản lượng nào khớp bộ lọc</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  {["Mã NV", "Tên NV", "Cơ sở", "Mã cây", "Quy cách"].map((h) => (
                    <th key={h} className="text-left px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">{h}</th>
                  ))}
                  {["SL bàn giao", "SL ghi nhận", "SL nhiễm", "Tỷ lệ nhiễm", "Đơn giá", "Thành tiền"].map((h) => (
                    <th key={h} className="text-right px-3 py-3 text-primary-strong font-bold text-base whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const firstOfStaff = i === 0 || rows[i - 1].staffId !== r.staffId;
                  return (
                    <tr key={`${r.staffId}-${r.plantTypeCode}-${r.stageCode}`} className={cn("border-b border-divider", firstOfStaff && i > 0 && "border-t-2 border-t-border")}>
                      <td className="px-3 py-2 font-mono text-xs text-text-secondary">{firstOfStaff ? r.staffCode : ""}</td>
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{firstOfStaff ? r.staffName : ""}</td>
                      <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{firstOfStaff ? r.warehouseName ?? "—" : ""}</td>
                      <td className="px-3 py-2 whitespace-nowrap" title={r.plantTypeName}>{r.plantTypeCode}</td>
                      <td className="px-3 py-2">{r.stageCode}</td>
                      <td className="px-3 py-2 text-right">{num(r.handedOverQuantity)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary-strong">{num(r.recordedQuantity)}</td>
                      <td className="px-3 py-2 text-right">{r.contaminatedQuantity ? num(r.contaminatedQuantity) : ""}</td>
                      <td className={cn("px-3 py-2 text-right", r.contaminationRatePct > 5 && "text-destructive font-medium")}>{r.contaminatedQuantity ? pct(r.contaminationRatePct) : ""}</td>
                      <td className="px-3 py-2 text-right">{r.unitPrice == null ? <span className="text-xs text-warning-foreground">Chưa cài</span> : num(r.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{num(r.amount)}</td>
                    </tr>
                  );
                })}
                {totals && (
                  <tr className="bg-primary-light font-bold">
                    <td className="px-3 py-2" colSpan={5}>Tổng</td>
                    <td className="px-3 py-2 text-right">{num(totals.handedOverQuantity)}</td>
                    <td className="px-3 py-2 text-right text-primary-strong">{num(totals.recordedQuantity)}</td>
                    <td className="px-3 py-2 text-right">{num(totals.contaminatedQuantity)}</td>
                    <td className="px-3 py-2 text-right">{pct(totalBase > 0 ? (totals.contaminatedQuantity / totalBase) * 100 : 0)}</td>
                    <td />
                    <td className="px-3 py-2 text-right">{num(totals.amount)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
