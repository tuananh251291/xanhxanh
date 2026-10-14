"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, subMonths } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { STOCK_COUNT_STATUS_LABELS } from "@/lib/stock-count-shared";
import { STOCK_COUNT_STATUS_CLASSES } from "./status-classes";

type ReportRow = {
  id: string;
  year: number;
  month: number;
  countDate: string;
  status: keyof typeof STOCK_COUNT_STATUS_LABELS;
  warehouse: { code: string; name: string };
  createdBy: { name: string };
  decidedBy: { name: string } | null;
  submittedAt: string | null;
  summary: { total: number; counted: number; matched: number; mismatched: number };
};

// Mặc định lập cho tháng vừa rồi nếu đang ở đầu tháng (kiểm kê cuối tháng trước), ngược lại tháng hiện tại.
function defaultPeriod() {
  const now = new Date();
  const ref = now.getDate() <= 10 ? subMonths(now, 1) : now;
  return { month: ref.getMonth() + 1, year: ref.getFullYear() };
}

export default function StockCountList({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [period, setPeriod] = useState(defaultPeriod);
  const [countDate, setCountDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/stock-counts")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setReports)
      .catch(() => { toast.error("Không tải được danh sách báo cáo"); setReports([]); });
  }, []);

  const create = async () => {
    setCreating(true);
    const res = await fetch("/api/stock-counts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...period, countDate }),
    });
    const json = await res.json().catch(() => ({}));
    setCreating(false);
    if (res.status === 409 && json.id) { toast.info(json.message); router.push(`/stock-counts/${json.id}`); return; }
    if (!res.ok) { toast.error(json.message ?? "Không lập được báo cáo"); return; }
    router.push(`/stock-counts/${json.id}`);
  };

  return (
    <div className="space-y-4">
      {canCreate && (
        <Card>
          <CardHeader><CardTitle className="text-base">Lập báo cáo đối chiếu</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Tháng</Label>
              <Input type="number" min={1} max={12} className="h-9 w-20" value={period.month} onChange={(e) => setPeriod((p) => ({ ...p, month: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>Năm</Label>
              <Input type="number" min={2024} className="h-9 w-24" value={period.year} onChange={(e) => setPeriod((p) => ({ ...p, year: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1">
              <Label>Ngày kiểm kê</Label>
              <Input type="date" className="h-9 w-40" value={countDate} onChange={(e) => setCountDate(e.target.value)} />
            </div>
            <Button onClick={create} disabled={creating || !countDate}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Lập báo cáo
            </Button>
            <p className="text-xs text-text-muted basis-full">
              Hệ thống lấy tồn trên phần mềm theo từng phòng + mã cây + quy cách tại lúc lập; có thể bấm &quot;Cập nhật tồn phần mềm&quot; trong báo cáo nếu kiểm kê ngày khác.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {reports === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-text-secondary"><Loader2 className="w-5 h-5 animate-spin" /> Đang tải…</div>
          ) : reports.length === 0 ? (
            <p className="text-center text-text-muted py-10">Chưa có báo cáo đối chiếu nào</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-primary-light">
                <tr>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Kỳ</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Kho</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Người phụ trách</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Ngày kiểm kê</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Số mã</th>
                  <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Chênh lệch</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-divider last:border-0">
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">Tháng {r.month}/{r.year}</td>
                    <td className="px-3 py-2">{r.warehouse.name}</td>
                    <td className="px-3 py-2">{r.createdBy.name}</td>
                    <td className="px-3 py-2 tabular-nums">{format(new Date(`${r.countDate.slice(0, 10)}T00:00:00`), "dd/MM/yyyy")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.summary.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.summary.mismatched > 0 ? <span className="text-destructive font-semibold">{r.summary.mismatched}</span> : r.summary.mismatched}</td>
                    <td className="px-3 py-2"><Badge className={STOCK_COUNT_STATUS_CLASSES[r.status]}>{STOCK_COUNT_STATUS_LABELS[r.status]}</Badge></td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/stock-counts/${r.id}`}><Button size="sm" variant="outline">Xem</Button></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
