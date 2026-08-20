"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import WarehouseFilterSelect from "@/components/shared/warehouse-filter-select";

type Row = { staffId: string; staffCode: string; staffName: string; warehouseName: string | null; vndPerDay: number | null };

export default function StaffKpiDailyRateBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [warehouseId, setWarehouseId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (warehouseId) params.set("warehouseId", warehouseId);
      const res = await fetch(`/api/payroll/staff-kpi-daily-rate?${params}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => { load(); }, [load]);

  const draftValue = (r: Row) => drafts[r.staffId] ?? (r.vndPerDay != null ? String(r.vndPerDay) : "");

  const save = async (r: Row) => {
    const value = Number(draftValue(r));
    if (!Number.isFinite(value) || value < 0) { toast.error("Số tiền không hợp lệ"); return; }
    setSavingId(r.staffId);
    try {
      const res = await fetch("/api/payroll/staff-kpi-daily-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: r.staffId, vndPerDay: value }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã lưu KPI/ngày cho ${r.staffName}`);
      load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <WarehouseFilterSelect value={warehouseId} onChange={setWarehouseId} />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Không có NV cấy mô nào khớp bộ lọc</p></CardContent></Card>
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
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">KPI/ngày (VNĐ)</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.staffId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{r.staffCode}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.staffName}</td>
                      <td className="px-4 py-3 text-text-secondary">{r.warehouseName ?? "—"}</td>
                      <td className="px-4 py-3 text-right">
                        <Input
                          type="number" min={0}
                          value={draftValue(r)}
                          onChange={(e) => setDrafts((p) => ({ ...p, [r.staffId]: e.target.value }))}
                          className="w-40 h-8 text-right ml-auto"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingId === r.staffId} onClick={() => save(r)}>
                          {savingId === r.staffId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary-strong" />}
                        </Button>
                      </td>
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
