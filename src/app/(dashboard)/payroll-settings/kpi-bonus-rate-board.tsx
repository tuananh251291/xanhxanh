"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Gauge } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Row = { id: string; periodMonth: string; maxAmount: number; createdBy: { name: string }; createdAt: string };

export default function KpiBonusRateBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodMonth, setPeriodMonth] = useState(format(new Date(), "yyyy-MM"));
  const [maxAmount, setMaxAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/kpi-bonus-rate");
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRate = async () => {
    const value = Number(maxAmount);
    if (!periodMonth || !Number.isFinite(value) || value < 0) { toast.error("Nhập đủ kỳ và mức thưởng hợp lệ"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/kpi-bonus-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodMonth, maxAmount: value }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã lưu mức thưởng KPI cho kỳ ${periodMonth}`);
      setMaxAmount("");
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Xoá mức thưởng KPI kỳ này?")) return;
    const res = await fetch(`/api/payroll/kpi-bonus-rate/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
    toast.success("Đã xoá");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-text-secondary">
            Mức thưởng KPI tuân thủ TỐI ĐA, áp dụng từ đúng kỳ chọn trở đi (tới khi có kỳ mới hơn) — không
            cần nhập lại mỗi kỳ nếu không đổi.
          </p>
          <div className="flex items-end gap-2 flex-wrap">
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Kỳ áp dụng từ</label>
              <Input type="month" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-text-secondary">Mức thưởng tối đa (VNĐ)</label>
              <Input type="number" min={0} value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="w-48" />
            </div>
            <Button onClick={addRate} disabled={saving} className="bg-primary hover:bg-primary-hover">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Lưu
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted"><p>Chưa cấu hình mức thưởng KPI nào</p></CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-lg divide-y divide-divider">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Gauge className="w-4 h-4 text-primary-strong shrink-0" />
                  <span className="font-medium text-foreground w-24">Kỳ {r.periodMonth}</span>
                  <span className="flex-1 text-foreground">{r.maxAmount.toLocaleString("vi-VN")} VNĐ</span>
                  <span className="text-xs text-text-muted">bởi {r.createdBy.name}</span>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
