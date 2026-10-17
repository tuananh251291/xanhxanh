"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { format, addDays, getISOWeek } from "date-fns";

type Item = {
  stageCode: string;
  totalQuantity: number;
  passedQuantity: number;
  failedQuantity: number;
  plantType: { code: string; name: string };
};
type Evaluation = {
  id: string;
  code: string;
  weekStart: string;
  reason: string | null;
  warehouse: { code: string; name: string };
  room: { name: string };
  rotationGroup: { name: string };
  assignedTo: { name: string; code: string };
  items: Item[];
  label: string;
  entryWeek: string | null;
  shelfRange: string | null;
};

const num = (n: number) => n.toLocaleString("vi-VN");

const ALL_WEEKS = "ALL";
const weekOptionLabel = (iso: string) => {
  const d = new Date(iso);
  return `Tuần ${getISOWeek(d)} (${format(d, "dd/MM")} – ${format(addDays(d, 6), "dd/MM/yyyy")})`;
};

const itemPct = (it: Item) => (it.totalQuantity > 0 ? Math.round((it.passedQuantity / it.totalQuantity) * 1000) / 10 : 0);

// Chi tiết theo cây dạng lưới 3 cột "Đạt / Tổng - % đạt", loại cây % đạt thấp nhất lên đầu.
export default function RootingQualityEvaluationReportBoard() {
  const colCount = 9;
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Lọc theo "Tuần giao Kho TP" — danh sách tuần lấy từ chính các đánh giá đang có, mới nhất lên đầu.
  const [week, setWeek] = useState<string>(ALL_WEEKS);
  const weekOptions = useMemo(
    () => [...new Set(evaluations.map((e) => e.weekStart))].sort((a, b) => (a < b ? 1 : -1)),
    [evaluations]
  );
  const shown = week === ALL_WEEKS ? evaluations : evaluations.filter((e) => e.weekStart === week);
  const exportHref = `/api/rooting-quality-evaluations/export${week === ALL_WEEKS ? "" : `?week=${encodeURIComponent(week)}`}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rooting-quality-evaluations?status=COMPLETED");
      setEvaluations(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-2 flex flex-wrap items-center gap-3">
          <Select
            items={[{ value: ALL_WEEKS, label: "Tất cả tuần" }, ...weekOptions.map((w) => ({ value: w, label: weekOptionLabel(w) }))]}
            value={week}
            onValueChange={(v) => { setWeek((v as string) ?? ALL_WEEKS); setExpanded(null); }}
          >
            <SelectTrigger className="h-9 w-full sm:w-72"><SelectValue placeholder="Chọn tuần giao Kho TP" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_WEEKS}>Tất cả tuần</SelectItem>
              {weekOptions.map((w) => <SelectItem key={w} value={w}>{weekOptionLabel(w)}</SelectItem>)}
            </SelectContent>
          </Select>
          <a href={exportHref} download>
            <Button variant="outline" size="sm" className="h-9" disabled={shown.length === 0}>
              <Download className="w-4 h-4 mr-1.5" /> Xuất Excel
            </Button>
          </a>
          <span className="text-sm text-text-muted">{shown.length} đánh giá đã hoàn thành</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-2 py-3 text-primary-strong font-bold text-base"></th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Nhóm tuần</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tuần giao Kho TP</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">NV Kỹ thuật</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Đạt</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Không đạt</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ đạt</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={colCount} className="px-3 py-6 text-center text-text-muted">Chưa có đánh giá nào hoàn thành</td></tr>
              ) : shown.map((e) => {
                const isOpen = expanded === e.id;
                const total = e.items.reduce((s, i) => s + i.totalQuantity, 0);
                const passed = e.items.reduce((s, i) => s + i.passedQuantity, 0);
                const failed = total - passed;
                const pct = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
                const weekStart = new Date(e.weekStart);
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="border-b border-divider last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                    >
                      <td className="px-2 py-3 text-text-muted">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {e.label}
                          {e.shelfRange && <span className="font-normal"> ({e.shelfRange})</span>}
                        </p>
                        {e.entryWeek && <p className="text-xs text-text-secondary">Vào phòng ra rễ {e.entryWeek}</p>}
                        <p className="text-xs text-text-secondary">{e.room.name} · <span className="font-mono">{e.code}</span></p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{e.warehouse.name}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                        <p className="text-foreground">Tuần {getISOWeek(weekStart)}</p>
                        <p className="text-xs">{format(weekStart, "dd/MM")} – {format(addDays(weekStart, 6), "dd/MM/yyyy")}</p>
                      </td>
                      <td className="px-4 py-3 text-foreground">{e.assignedTo.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-success-foreground font-medium">{num(passed)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-destructive font-medium">{num(failed)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{pct}%</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-background border-b">
                        <td colSpan={colCount} className="px-6 py-4">
                          {e.reason && (
                            <p className="text-sm text-foreground mb-3">
                              <span className="font-medium">Lý do:</span> {e.reason}
                            </p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                              {[...e.items]
                                .sort((a, b) => itemPct(a) - itemPct(b) || a.plantType.code.localeCompare(b.plantType.code))
                                .map((it, i) => (
                                  <div key={i} className="rounded-lg border border-divider bg-card px-3 py-2 text-sm">
                                    <p className="font-medium text-foreground">
                                      <span className="font-mono text-text-secondary mr-1.5">{it.plantType.code}</span>
                                      {it.plantType.name} ({it.stageCode})
                                    </p>
                                    <p className="text-text-secondary tabular-nums">
                                      Đạt <span className="text-success-foreground font-medium">{num(it.passedQuantity)}</span> / Tổng {num(it.totalQuantity)} - % đạt:{" "}
                                      <span className="font-bold text-foreground">{itemPct(it)}%</span>
                                    </p>
                                  </div>
                                ))}
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
  );
}
