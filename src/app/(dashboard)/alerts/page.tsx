"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { ALERT_TYPE_LABELS, ALERT_STATUS_LABELS } from "@/types";

type Alert = {
  id: string;
  type: keyof typeof ALERT_TYPE_LABELS;
  status: keyof typeof ALERT_STATUS_LABELS;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};

const STATUS_COLORS: Record<Alert["status"], string> = {
  UNREAD: "bg-red-100 text-red-700",
  READ: "bg-gray-100 text-gray-600",
  RESOLVED: "bg-green-100 text-green-700",
};

const FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "UNREAD", label: "Chưa đọc" },
  { value: "RESOLVED", label: "Đã xử lý" },
] as const;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/alerts${qs}`);
      if (res.ok) setAlerts(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const updateStatus = async (id: string, status: "READ" | "RESOLVED") => {
    setProcessing(id);
    try {
      const res = await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) { toast.error("Có lỗi xảy ra"); return; }
      load(filter);
    } finally { setProcessing(null); }
  };

  const unreadCount = alerts.filter((a) => a.status === "UNREAD").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-500" /> Thông báo
          </h1>
          <p className="text-gray-500 text-sm mt-1">{unreadCount} chưa đọc</p>
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={filter === f.value ? "default" : "outline"}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : alerts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có thông báo nào</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Card key={a.id} className={a.status === "UNREAD" ? "border-l-4 border-l-red-400" : ""}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLORS[a.status]}>{ALERT_STATUS_LABELS[a.status]}</Badge>
                      <Badge variant="secondary" className="text-xs">{ALERT_TYPE_LABELS[a.type] ?? a.type}</Badge>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{a.title}</p>
                    <p className="text-sm text-gray-500">{a.message}</p>
                    <p className="text-xs text-gray-400">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: vi })}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {a.status === "UNREAD" && (
                      <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "READ")} disabled={processing === a.id}>
                        {processing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                    )}
                    {a.status !== "RESOLVED" && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => updateStatus(a.id, "RESOLVED")} disabled={processing === a.id}>
                        {processing === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
