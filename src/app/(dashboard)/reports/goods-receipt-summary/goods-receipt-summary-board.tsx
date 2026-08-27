"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

type Warehouse = { id: string; code: string; name: string };
type Row = {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  receiptCount: number;
  totalDelivered: number;
  totalPassed: number;
};
type Summary = { totalDelivered: number; totalPassed: number; supplierCount: number };

const ALL_WAREHOUSE = "ALL";

export default function GoodsReceiptSummaryBoard({
  warehouses, showWarehouseFilter,
}: {
  warehouses: Warehouse[];
  // Quản lý kho thành phẩm chỉ có đúng 1 kho — ẩn bộ lọc, API tự ép theo workplaceWarehouseId.
  showWarehouseFilter: boolean;
}) {
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [warehouseId, setWarehouseId] = useState(ALL_WAREHOUSE);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (warehouseId !== ALL_WAREHOUSE) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/reports/goods-receipt-summary?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setSummary(data.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, [month, warehouseId]);

  useEffect(() => { load(); }, [load]);

  const overallPct = summary && summary.totalDelivered > 0
    ? Math.round((summary.totalPassed / summary.totalDelivered) * 1000) / 10
    : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Tháng</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          </div>
          {showWarehouseFilter && (
            <div className="space-y-1">
              <Label className="text-xs">Kho thành phẩm</Label>
              <Select
                items={[{ value: ALL_WAREHOUSE, label: "Tất cả kho" }, ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
                value={warehouseId}
                onValueChange={(v) => setWarehouseId((v as string) ?? ALL_WAREHOUSE)}
              >
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_WAREHOUSE}>Tất cả kho</SelectItem>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && (
        <p className="text-sm text-text-secondary">
          {summary.supplierCount} NCC · Tổng nhận: <strong className="text-foreground">{summary.totalDelivered.toLocaleString("vi-VN")}</strong>
          {" "}· Tổng ghi nhận: <strong className="text-primary-strong">{summary.totalPassed.toLocaleString("vi-VN")}</strong>
          {" "}· Tỉ lệ đạt chung: <strong>{overallPct}%</strong>
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <p>Không có phiếu nhập hàng NCC nào khớp bộ lọc</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Nhà cung cấp</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số phiếu</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng tổng nhận</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng được ghi nhận</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pct = r.totalDelivered > 0 ? Math.round((r.totalPassed / r.totalDelivered) * 1000) / 10 : 0;
                    return (
                      <tr key={r.supplierId} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-3 font-medium text-foreground">{r.supplierName} <span className="font-mono text-xs text-text-muted">({r.supplierCode})</span></td>
                        <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{r.receiptCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.totalDelivered.toLocaleString("vi-VN")}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-primary-strong">{r.totalPassed.toLocaleString("vi-VN")}</td>
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
