"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

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
  completedAt: string | null;
  warehouse: { code: string; name: string };
  room: { name: string };
  rotationGroup: { name: string };
  assignedTo: { name: string; code: string };
  items: Item[];
};

const num = (n: number) => n.toLocaleString("vi-VN");

export default function RootingQualityEvaluationReportBoard() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

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
        <div className="px-4 pt-4 pb-1 text-sm text-text-muted">{evaluations.length} đánh giá đã hoàn thành</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-2 py-3 text-primary-strong font-bold text-base"></th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Nhóm tuần</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Cơ sở</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">NV Kỹ thuật</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Hoàn thành</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tổng</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Đạt</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Không đạt</th>
                <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Tỉ lệ đạt</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.length === 0 ? (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-text-muted">Chưa có đánh giá nào hoàn thành</td></tr>
              ) : evaluations.map((e) => {
                const isOpen = expanded === e.id;
                const total = e.items.reduce((s, i) => s + i.totalQuantity, 0);
                const passed = e.items.reduce((s, i) => s + i.passedQuantity, 0);
                const failed = total - passed;
                const pct = total > 0 ? Math.round((passed / total) * 1000) / 10 : 0;
                return (
                  <Fragment key={e.id}>
                    <tr
                      className="border-b border-divider last:border-0 even:bg-primary-light/30 cursor-pointer hover:bg-primary-light/50"
                      onClick={() => setExpanded(isOpen ? null : e.id)}
                    >
                      <td className="px-2 py-3 text-text-muted">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{e.rotationGroup.name}</p>
                        <p className="text-xs text-text-secondary">{e.room.name} · <span className="font-mono">{e.code}</span></p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{e.warehouse.name}</td>
                      <td className="px-4 py-3 text-foreground">{e.assignedTo.name}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                        {e.completedAt ? format(new Date(e.completedAt), "dd/MM/yyyy HH:mm", { locale: vi }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{num(total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-success-foreground font-medium">{num(passed)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-destructive font-medium">{num(failed)}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums">{pct}%</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-background border-b">
                        <td colSpan={9} className="px-6 py-4">
                          {e.reason && (
                            <p className="text-sm text-foreground mb-3">
                              <span className="font-medium">Lý do:</span> {e.reason}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {e.items.map((it, i) => (
                              <Badge key={i} className="bg-info-light text-info-foreground">
                                {it.plantType.code} ({it.stageCode}): {num(it.totalQuantity)} — đạt {num(it.passedQuantity)} / không đạt {num(it.failedQuantity)}
                              </Badge>
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
