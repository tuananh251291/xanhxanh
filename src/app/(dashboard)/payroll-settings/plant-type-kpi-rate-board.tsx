"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type Row = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; vndPerUnit: number | null };

export default function PlantTypeKpiRateBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/plant-type-kpi-rate");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const draftValue = (r: Row) => drafts[r.plantTypeId] ?? (r.vndPerUnit != null ? String(r.vndPerUnit) : "");

  const save = async (r: Row) => {
    const value = Number(draftValue(r));
    if (!Number.isFinite(value) || value < 0) { toast.error("Đơn giá không hợp lệ"); return; }
    setSavingId(r.plantTypeId);
    try {
      const res = await fetch("/api/payroll/plant-type-kpi-rate", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantTypeId: r.plantTypeId, vndPerUnit: value }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã lưu đơn giá cho ${r.plantTypeCode}`);
      load();
    } finally {
      setSavingId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => r.plantTypeCode.toLowerCase().includes(q) || r.plantTypeName.toLowerCase().includes(q))
    : rows;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <Input placeholder="Tìm theo mã hoặc tên cây…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-64" />
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Không có mã cây nào khớp</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Đơn giá (VNĐ/đơn vị)</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.plantTypeId} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-info-foreground">{r.plantTypeCode}</td>
                      <td className="px-4 py-3 text-foreground">{r.plantTypeName}</td>
                      <td className="px-4 py-3 text-right">
                        <Input
                          type="number" min={0}
                          value={draftValue(r)}
                          onChange={(e) => setDrafts((p) => ({ ...p, [r.plantTypeId]: e.target.value }))}
                          className="w-40 h-8 text-right ml-auto"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={savingId === r.plantTypeId} onClick={() => save(r)}>
                          {savingId === r.plantTypeId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-primary-strong" />}
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
