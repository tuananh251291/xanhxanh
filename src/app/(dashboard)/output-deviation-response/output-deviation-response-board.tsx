"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, Check, X, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";

type Alert = {
  id: string;
  title: string;
  message: string;
  status: string;
  relatedId: string | null;
  createdAt: string;
};

export default function OutputDeviationResponseBoard() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  // Đánh giá đang mở ô ghi ý kiến "Không đồng ý" (alert id) + nội dung ý kiến theo từng đánh giá.
  const [disagreeOpen, setDisagreeOpen] = useState<string | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Lấy mọi đánh giá CHƯA phản hồi (khác RESOLVED) — không lọc theo UNREAD: bấm "Xem chi tiết" ở trang
      // Thông báo đã đánh dấu thông báo là READ trước khi chuyển sang đây, lọc UNREAD thì đánh giá biến mất
      // ngay khi vừa mở. Alert chỉ chuyển RESOLVED khi NV đã phản hồi (PATCH /api/output-deviation-resolutions).
      const res = await fetch("/api/alerts?type=OUTPUT_DEVIATION_STAFF_RESPONSE_NEEDED");
      if (res.ok) {
        const data: Alert[] = await res.json();
        setAlerts(data.filter((a) => a.status !== "RESOLVED"));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = async (alert: Alert, action: "accept" | "disagree") => {
    if (!alert.relatedId) return;
    const feedback = (feedbacks[alert.id] ?? "").trim();
    if (action === "disagree" && !feedback) { toast.error("Vui lòng ghi ý kiến phản hồi khi không đồng ý"); return; }
    setProcessing(alert.id);
    try {
      const res = await fetch(`/api/output-deviation-resolutions/${alert.relatedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "disagree" ? { action, feedback } : { action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        action === "accept"
          ? "Đã xác nhận đồng ý với đánh giá"
          : "Đã gửi ý kiến không đồng ý tới NV Kỹ thuật và Admin kỹ thuật"
      );
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      setDisagreeOpen(null);
      router.refresh();
    } catch {
      toast.error("Không kết nối được máy chủ — vui lòng thử lại");
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
          {alerts.map((a) => {
            const isDisagreeOpen = disagreeOpen === a.id;
            return (
              <Card key={a.id} className="border-l-4 border-l-warning">
                <CardContent className="py-3 space-y-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">{a.title}</p>
                    <p className="text-sm text-text-secondary whitespace-pre-line">{a.message}</p>
                    <p className="text-xs text-text-muted">{formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: vi })}</p>
                  </div>
                  {isDisagreeOpen ? (
                    <div className="space-y-2 pt-2 border-t">
                      <label className="text-sm font-medium text-foreground">
                        Ý kiến phản hồi <span className="text-destructive">*</span>
                      </label>
                      <textarea
                        value={feedbacks[a.id] ?? ""}
                        onChange={(e) => setFeedbacks((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="Giải thích lý do bạn không đồng ý với đánh giá..."
                        rows={3}
                        maxLength={1000}
                        autoFocus
                        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive text-destructive hover:bg-danger-light"
                          disabled={processing === a.id || !(feedbacks[a.id] ?? "").trim()}
                          onClick={() => respond(a, "disagree")}
                        >
                          {processing === a.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                          Gửi phản hồi không đồng ý
                        </Button>
                        <Button size="sm" variant="ghost" disabled={processing === a.id} onClick={() => setDisagreeOpen(null)}>
                          Huỷ
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        className="bg-primary hover:bg-primary-hover"
                        disabled={processing === a.id}
                        onClick={() => respond(a, "accept")}
                      >
                        {processing === a.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                        Đồng ý với đánh giá
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-danger-light"
                        disabled={processing === a.id}
                        onClick={() => setDisagreeOpen(a.id)}
                      >
                        <X className="w-4 h-4 mr-1" />
                        Không đồng ý với đánh giá
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
