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
import { Checkbox } from "@/components/ui/checkbox";

type DeviationCause = keyof typeof DEVIATION_CAUSE_LABELS;

type Alert = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
};

type PlantingErrorType = { id: string; label: string };

export default function PlantingCheckBoard() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [causeSelection, setCauseSelection] = useState<Record<string, DeviationCause>>({});
  const [errorTypes, setErrorTypes] = useState<PlantingErrorType[]>([]);
  const [errorSelection, setErrorSelection] = useState<Record<string, string[]>>({});
  const [reasonSelection, setReasonSelection] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?type=OUTPUT_DEVIATION&unresolved=1");
      if (res.ok) setAlerts(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/planting-error-types").then((res) => res.ok && res.json()).then((data) => data && setErrorTypes(data));
  }, []);

  const toggleError = (alertId: string, errorTypeId: string) => {
    setErrorSelection((prev) => {
      const current = prev[alertId] ?? [];
      const next = current.includes(errorTypeId) ? current.filter((id) => id !== errorTypeId) : [...current, errorTypeId];
      return { ...prev, [alertId]: next };
    });
  };

  const canResolve = (id: string) => {
    const cause = causeSelection[id];
    if (!cause) return false;
    if (cause === "CAY_MO_SAI") return (errorSelection[id]?.length ?? 0) > 0;
    if (cause === "KY_THUAT_SAI") return !!reasonSelection[id]?.trim();
    return true;
  };

  const resolve = async (id: string) => {
    const cause = causeSelection[id];
    if (!cause || !canResolve(id)) return;
    setProcessing(id);
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: "RESOLVED",
          cause,
          ...(cause === "CAY_MO_SAI" ? { plantingErrorTypeIds: errorSelection[id] } : {}),
          ...(cause === "KY_THUAT_SAI" ? { reasonText: reasonSelection[id]?.trim() } : {}),
        }),
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
                    disabled={!canResolve(a.id) || processing === a.id}
                    onClick={() => resolve(a.id)}
                  >
                    {processing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    Đã xem
                  </Button>
                </div>

                {causeSelection[a.id] === "CAY_MO_SAI" && (
                  <div className="pt-1 space-y-1.5">
                    <p className="text-xs font-medium text-text-secondary">Chọn (các) lỗi cấy:</p>
                    {errorTypes.length === 0 ? (
                      <p className="text-xs text-text-muted">Chưa có danh mục lỗi cấy — vào &quot;Phân loại lỗi cấy&quot; để thêm.</p>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {errorTypes.map((et) => (
                          <label key={et.id} className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                            <Checkbox
                              checked={(errorSelection[a.id] ?? []).includes(et.id)}
                              onCheckedChange={() => toggleError(a.id, et.id)}
                            />
                            {et.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {causeSelection[a.id] === "KY_THUAT_SAI" && (
                  <div className="pt-1 space-y-1.5">
                    <p className="text-xs font-medium text-text-secondary">Giải thích nguyên nhân:</p>
                    <textarea
                      value={reasonSelection[a.id] ?? ""}
                      onChange={(e) => setReasonSelection((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
