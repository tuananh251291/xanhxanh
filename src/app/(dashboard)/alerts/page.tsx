"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { ALERT_TYPE_LABELS } from "@/types";

type Alert = {
  id: string;
  type: keyof typeof ALERT_TYPE_LABELS;
  title: string;
  message: string;
  createdAt: string;
};

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts?status=UNREAD");
      if (res.ok) setAlerts(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Đánh dấu đã xem chỉ để tắt thông báo — không đồng nghĩa đã xử lý. Riêng thông báo lệch tiến độ
  // (OUTPUT_DEVIATION) vẫn cần chọn nguyên nhân xử lý tại trang "Kiểm tra tình trạng cấy".
  const markSeen = async (id: string) => {
    setProcessing(id);
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "READ" }),
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
          <Bell className="w-6 h-6 text-warning-foreground" /> Thông báo
        </h1>
        <p className="text-text-secondary text-sm mt-1">{alerts.length} chưa xem</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Bell className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Không có thông báo nào</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className="border-l-4 border-l-destructive">
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-xs">{ALERT_TYPE_LABELS[a.type] ?? a.type}</Badge>
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                    <p className="text-sm text-text-secondary">{a.message}</p>
                    <p className="text-xs text-text-muted">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: vi })}</p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary-hover shrink-0"
                    onClick={() => markSeen(a.id)}
                    disabled={processing === a.id}
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
