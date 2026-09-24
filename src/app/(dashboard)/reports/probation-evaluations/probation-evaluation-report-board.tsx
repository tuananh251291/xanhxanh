"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type Evaluation = {
  id: string;
  code: string;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  status: "PENDING_SELF" | "PENDING_MANAGER" | "COMPLETED";
  managerPercent: number | null;
  result: "DAT" | "CAN_CAI_THIEN" | "KHONG_DAT" | null;
  managerComment: string | null;
  staff: { name: string; code: string; workplaceWarehouse: { name: string } | null };
  manager: { name: string; code: string } | null;
};

const STATUS_LABEL: Record<Evaluation["status"], string> = {
  PENDING_SELF: "Chờ tự chấm",
  PENDING_MANAGER: "Chờ NV kỹ thuật",
  COMPLETED: "Xong",
};
const RESULT_BADGE: Record<string, string> = {
  DAT: "bg-success-light text-success-foreground",
  CAN_CAI_THIEN: "bg-warning-light text-warning-foreground",
  KHONG_DAT: "bg-danger-light text-destructive",
};
const RESULT_LABEL: Record<string, string> = { DAT: "Đạt", CAN_CAI_THIEN: "Cần cải thiện", KHONG_DAT: "Không đạt" };

export default function ProbationEvaluationReportBoard() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/probation-evaluations");
      setEvaluations(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const byStaff = useMemo(() => {
    const map = new Map<string, Evaluation[]>();
    for (const e of evaluations) {
      const key = e.staff.code;
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [evaluations]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (byStaff.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-text-muted">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có phiếu đánh giá nào</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {byStaff.map(([code, rows]) => {
        const sorted = rows.slice().sort((a, b) => a.weekNumber - b.weekNumber);
        return (
          <Card key={code}>
            <CardHeader>
              <CardTitle className="text-base">
                {sorted[0].staff.name} <span className="text-text-muted font-normal font-mono">({code})</span>
                {sorted[0].staff.workplaceWarehouse && (
                  <span className="text-text-muted font-normal text-sm"> — {sorted[0].staff.workplaceWarehouse.name}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary-light">
                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Tuần</th>
                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Thời gian</th>
                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
                      <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">%</th>
                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Kết quả</th>
                      <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Nhận xét NV Kỹ thuật</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-3 py-2">
                          <Link
                            href={`/probation-evaluations/${e.id}`}
                            className="text-info-foreground hover:underline"
                            title="Xem chi tiết điểm từng tiêu chí"
                          >
                            Tuần {e.weekNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                          {format(new Date(e.weekStart), "dd/MM", { locale: vi })} – {format(new Date(e.weekEnd), "dd/MM/yyyy", { locale: vi })}
                        </td>
                        <td className="px-3 py-2 text-text-secondary">{STATUS_LABEL[e.status]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.managerPercent ?? "—"}</td>
                        <td className="px-3 py-2">
                          {e.result ? <Badge className={RESULT_BADGE[e.result]}>{RESULT_LABEL[e.result]}</Badge> : "—"}
                        </td>
                        <td className="px-3 py-2 text-text-secondary max-w-sm whitespace-pre-line">{e.managerComment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
