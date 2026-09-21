"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  staff: { name: string; code: string; workplaceWarehouse: { name: string } | null };
  manager: { name: string; code: string } | null;
};

const STATUS_BADGE: Record<Evaluation["status"], { label: string; variant: "in-progress" | "overdue" | "completed" }> = {
  PENDING_SELF: { label: "Chờ NV cấy mô tự chấm", variant: "overdue" },
  PENDING_MANAGER: { label: "Chờ NV kỹ thuật chấm", variant: "in-progress" },
  COMPLETED: { label: "Đã hoàn thành", variant: "completed" },
};

const RESULT_BADGE: Record<string, string> = {
  DAT: "bg-success-light text-success-foreground",
  CAN_CAI_THIEN: "bg-warning-light text-warning-foreground",
  KHONG_DAT: "bg-danger-light text-destructive",
};
const RESULT_LABEL: Record<string, string> = { DAT: "Đạt", CAN_CAI_THIEN: "Cần cải thiện", KHONG_DAT: "Không đạt" };

export default function ProbationEvaluationBoard() {
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

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (evaluations.length === 0) {
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
    <div className="space-y-3">
      {evaluations.map((e) => (
        <Card key={e.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                Tuần {e.weekNumber} <span className="text-text-muted font-normal">— {e.staff.name} ({e.staff.code})</span>
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                <span className="font-mono">{e.code}</span> · {format(new Date(e.weekStart), "dd/MM", { locale: vi })} – {format(new Date(e.weekEnd), "dd/MM/yyyy", { locale: vi })}
                {e.staff.workplaceWarehouse && <> · {e.staff.workplaceWarehouse.name}</>}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={STATUS_BADGE[e.status].variant}>{STATUS_BADGE[e.status].label}</Badge>
              {e.status === "COMPLETED" && e.result && (
                <>
                  <span className="text-sm font-bold text-foreground">{e.managerPercent}%</span>
                  <Badge className={RESULT_BADGE[e.result]}>{RESULT_LABEL[e.result]}</Badge>
                </>
              )}
              <Link href={`/probation-evaluations/${e.id}`}>
                <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
                  {e.status === "COMPLETED" ? "Xem" : "Chấm điểm"}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
