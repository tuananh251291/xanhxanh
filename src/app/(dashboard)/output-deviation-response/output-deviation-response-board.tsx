"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

type Alert = {
  id: string;
  title: string;
  message: string;
  relatedId: string | null;
  createdAt: string;
};

export default function OutputDeviationResponseBoard() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?type=OUTPUT_DEVIATION_STAFF_RESPONSE_NEEDED&status=UNREAD");
      if (res.ok) setAlerts(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = async (alert: Alert, action: "accept" | "disagree") => {
    if (!alert.relatedId) return;
    setProcessing(alert.id);
    try {
      const res = await fetch(`/api/output-deviation-resolutions/${alert.relatedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      router.refresh();
    } finally { setProcessing(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-warning-foreground" /> Phản hồi đánh giá lệch cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">{alerts.length} đánh giá cấy sai chỉ định cần bạn phản hồi</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có đánh giá nào cần phản hồi</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className="border-l-4 border-l-warning">
              <CardContent className="py-3 space-y-2">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-sm text-text-secondary whitespace-pre-line">{a.message}</p>
                  <p className="text-xs text-text-muted">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: vi })}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary-hover"
                    disabled={processing === a.id}
                    onClick={() => respond(a, "accept")}
                  >
                    {processing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                    Xác nhận đánh giá
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive text-destructive hover:bg-danger-light"
                    disabled={processing === a.id}
                    onClick={() => respond(a, "disagree")}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Không đồng ý với đánh giá
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
