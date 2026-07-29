"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { DEVIATION_CAUSE_LABELS } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type DeviationCause = keyof typeof DEVIATION_CAUSE_LABELS;

type Alert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

export default function PlantingCheckBoard() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [causeSelection, setCauseSelection] = useState<Record<string, DeviationCause>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?type=OUTPUT_DEVIATION&unresolved=1");
      if (res.ok) setAlerts(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string) => {
    const cause = causeSelection[id];
    if (!cause) return;
    setProcessing(id);
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "RESOLVED", cause }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      router.refresh();
    } finally { setProcessing(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-warning-foreground" /> Kiểm tra tình trạng cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">{alerts.length} chỉ định cấy lệch tiến độ cần xác định nguyên nhân</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có chỉ định nào cấy lệch tiến độ</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className="border-l-4 border-l-destructive">
              <CardContent className="py-3 space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-sm text-text-secondary whitespace-pre-line">{a.message}</p>
                  <p className="text-xs text-text-muted">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: vi })}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                  <Select
                    items={DEVIATION_CAUSE_LABELS}
                    value={causeSelection[a.id] ?? ""}
                    onValueChange={(v) => setCauseSelection((prev) => ({ ...prev, [a.id]: v as DeviationCause }))}
                  >
                    <SelectTrigger className="h-11 sm:h-8 text-xs w-full sm:w-72">
                      <SelectValue placeholder="Chọn nguyên nhân..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DEVIATION_CAUSE_LABELS) as DeviationCause[]).map((c) => (
                        <SelectItem key={c} value={c}>{DEVIATION_CAUSE_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary-hover"
                    disabled={!causeSelection[a.id] || processing === a.id}
                    onClick={() => resolve(a.id)}
                  >
                    {processing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    Đã xem
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
