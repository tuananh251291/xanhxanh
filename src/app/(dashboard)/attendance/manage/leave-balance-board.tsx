"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type UserRole } from "@/types";

type Row = {
  userId: string;
  name: string;
  code: string;
  role: UserRole | null;
  warehouseName: string | null;
  total: number;
  isCustom: boolean;
  used: number;
  pending: number;
  remaining: number;
};

export default function LeaveBalanceBoard() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [rows, setRows] = useState<Row[]>([]);
  const [defaultDays, setDefaultDays] = useState(12);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance/leave-balances?year=${year}`);
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Không tải được quỹ phép"); return; }
      setRows(json.rows);
      setDefaultDays(json.defaultDays);
      setEdits({});
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const save = async (userId: string) => {
    const totalDays = Number(edits[userId]);
    if (Number.isNaN(totalDays)) { toast.error("Số ngày không hợp lệ"); return; }
    setSavingId(userId);
    try {
      const res = await fetch("/api/attendance/leave-balances", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, year, totalDays }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Lưu thất bại"); return; }
      toast.success("Đã lưu quỹ phép");
      load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <p className="text-xs text-text-secondary">Năm</p>
          <Input type="number" value={year} onChange={(e) => { setLoading(true); setYear(Number(e.target.value)); }} className="w-28" />
        </div>
        <p className="text-sm text-text-secondary pb-2">Mặc định {defaultDays} ngày/năm — sửa riêng cho NV có thâm niên/chế độ khác.</p>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-text-muted" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Nhân viên</th>
                  <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Khu</th>
                  <th className="text-center px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Tổng phép</th>
                  <th className="text-center px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Đã dùng</th>
                  <th className="text-center px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Đang chờ</th>
                  <th className="text-center px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Còn lại</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const editing = edits[r.userId] !== undefined;
                  return (
                    <tr key={r.userId} className="border-b border-divider last:border-0 even:bg-background">
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">{r.name} <span className="text-xs text-text-muted font-mono">({r.code})</span></p>
                        <p className="text-xs text-text-secondary">{r.role ? ROLE_LABELS[r.role] : ""}</p>
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{r.warehouseName ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Input
                            type="number"
                            step={0.5}
                            min={0}
                            className="w-20 h-8 text-center"
                            value={editing ? edits[r.userId] : String(r.total)}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [r.userId]: e.target.value }))}
                          />
                          {editing && edits[r.userId] !== String(r.total) && (
                            <Button size="sm" className="h-8" disabled={savingId === r.userId} onClick={() => save(r.userId)}>
                              {savingId === r.userId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">{r.used}</td>
                      <td className="px-3 py-2 text-center text-warning-foreground">{r.pending || ""}</td>
                      <td className="px-3 py-2 text-center font-semibold text-primary-strong">{r.remaining}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
