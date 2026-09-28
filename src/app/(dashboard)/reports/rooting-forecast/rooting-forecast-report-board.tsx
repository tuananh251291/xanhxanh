"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight, ChevronLeft, Download } from "lucide-react";
import { format } from "date-fns";

type ForecastEntryRow = {
  entryId: string;
  plantTypeCode: string; plantTypeName: string;
  staffCode: string; staffName: string;
  quantity1: number; quantity2: number; quantity3: number;
};
type WarehouseOverview = {
  warehouseId: string; warehouseCode: string; warehouseName: string;
  isLocked: boolean;
  submittedByCode: string | null; submittedByName: string | null;
  submittedAt: string | null; isOnTime: boolean | null;
  entries: ForecastEntryRow[];
};
type OverviewData = {
  taskMonth: string; targetMonths: [string, string, string]; deadline: string;
  prevTaskMonth: string; nextTaskMonth: string | null;
  warehouses: WarehouseOverview[];
};

const monthLabel = (iso: string) => format(new Date(iso), "MM/yyyy");
const num = (n: number) => n.toLocaleString("vi-VN");

function StatusBadge({ w }: { w: WarehouseOverview }) {
  if (!w.isLocked) return <Badge variant="info">Chưa nộp</Badge>;
  return w.isOnTime ? <Badge variant="completed">Đã nộp — Đúng hạn</Badge> : <Badge variant="overdue">Đã nộp — Trễ hạn</Badge>;
}

export default function RootingForecastReportBoard() {
  const [taskMonth, setTaskMonth] = useState<string | null>(null);
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (month: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (month) params.set("taskMonth", month);
      const res = await fetch(`/api/reports/rooting-forecast?${params}`);
      const json = await res.json();
      if (res.ok) setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(taskMonth); }, [taskMonth, load]);

  if (loading && !data) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }
  if (!data) return null;

  const submittedCount = data.warehouses.filter((w) => w.isLocked).length;
  const exportHref = `/api/reports/rooting-forecast/export?taskMonth=${data.taskMonth}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => setTaskMonth(data.prevTaskMonth)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <p className="text-sm text-text-secondary">
              Lộ trình 3 tháng — <strong className="text-primary-strong">{data.targetMonths.map(monthLabel).join(", ")}</strong>
              {" "}· Hạn nộp: <strong className="text-foreground">{format(new Date(data.deadline), "dd/MM/yyyy")}</strong>
              {" "}· {submittedCount}/{data.warehouses.length} cơ sở đã nộp
            </p>
            <Button type="button" variant="outline" size="icon-sm" disabled={!data.nextTaskMonth} onClick={() => data.nextTaskMonth && setTaskMonth(data.nextTaskMonth)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <a href={exportHref}>
            <Button type="button" className="bg-primary hover:bg-primary-hover">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Xuất Excel
            </Button>
          </a>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : data.warehouses.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">Chưa có cơ sở sản xuất nào</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base"></th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Người nộp</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Thời gian nộp</th>
                    <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số dòng</th>
                  </tr>
                </thead>
                <tbody>
                  {data.warehouses.map((w) => {
                    const isOpen = expanded === w.warehouseId;
                    return (
                      <Fragment key={w.warehouseId}>
                        <tr
                          className="border-b last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                          onClick={() => setExpanded(isOpen ? null : w.warehouseId)}
                        >
                          <td className="px-2 py-3 text-text-muted">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{w.warehouseName} ({w.warehouseCode})</td>
                          <td className="px-4 py-3"><StatusBadge w={w} /></td>
                          <td className="px-4 py-3 text-text-secondary">{w.submittedByName ? `${w.submittedByCode} — ${w.submittedByName}` : "—"}</td>
                          <td className="px-4 py-3 text-text-secondary">{w.submittedAt ? format(new Date(w.submittedAt), "dd/MM/yyyy HH:mm") : "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{w.entries.length}</td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-background border-b">
                            <td colSpan={6} className="px-6 py-4">
                              {w.entries.length === 0 ? (
                                <p className="text-sm text-text-muted">Chưa có dòng nào</p>
                              ) : (
                                <div className="overflow-x-auto border border-divider rounded-md">
                                  <table className="w-full text-xs">
                                    <thead className="bg-primary-light">
                                      <tr>
                                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">Mã cây</th>
                                        <th className="text-left px-3 py-2 text-primary-strong font-bold text-sm">NV cấy mô</th>
                                        {data.targetMonths.map((m, i) => (
                                          <th key={i} className="text-right px-3 py-2 text-primary-strong font-bold text-sm">SL — Th.{monthLabel(m)}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {w.entries.map((e) => (
                                        <tr key={e.entryId} className="border-t border-divider even:bg-background odd:bg-card">
                                          <td className="px-3 py-1.5">{e.plantTypeCode} — {e.plantTypeName}</td>
                                          <td className="px-3 py-1.5">{e.staffCode} — {e.staffName}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums">{num(e.quantity1)}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums">{num(e.quantity2)}</td>
                                          <td className="px-3 py-1.5 text-right tabular-nums">{num(e.quantity3)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
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
