"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { EXTRA_WORK_REQUEST_STATUS_LABELS, WORK_SESSION_LABELS } from "@/types";

type Request = {
  id: string;
  type: "EARLY_COMPLETION" | "OVERTIME";
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  staff: { name: string; code: string };
  instruction: { code: string } | null;
  expectedEndDate: string | null;
  expectedEndSession: "SANG" | "CHIEU" | null;
  respondedBy: { name: string } | null;
  slots: { date: string; startTime: string; endTime: string }[];
};

const STATUS_BADGE_VARIANT = {
  PENDING: "in-progress",
  APPROVED: "completed",
  REJECTED: "overdue",
} as const;

export default function ExtraWorkRequestBoard() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Ẩn hẳn đăng ký đã bị từ chối khỏi bảng này — NV đã được báo qua Alert (xem PATCH [id]/route.ts),
      // không cần Kho mô theo dõi tiếp trong danh sách thao tác hàng ngày.
      const res = await fetch("/api/extra-work-requests?excludeRejected=true");
      setRequests(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const respond = async (id: string, action: "confirm" | "approve" | "reject") => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/extra-work-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(action === "reject" ? "Đã từ chối đăng ký" : "Đã xác nhận đăng ký");
      load();
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-1 text-sm text-text-muted">
          {requests.length} đăng ký{pendingCount > 0 && <span className="text-warning-foreground font-medium"> · {pendingCount} chờ xử lý</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">NV</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Loại</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Chi tiết</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Ngày gửi</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Trạng thái</th>
                <th className="px-3 py-2 font-bold text-base"></th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-text-muted">Chưa có đăng ký nào</td></tr>
              ) : requests.map((r) => (
                <tr key={r.id} className="border-b border-divider last:border-0 even:bg-background">
                  <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.staff.name}</td>
                  <td className="px-3 py-2 text-foreground whitespace-nowrap">
                    {r.type === "EARLY_COMPLETION" ? "Hoàn thành sớm" : "Làm thêm ngoài giờ"}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">
                    {r.type === "EARLY_COMPLETION" ? (
                      <>
                        {r.instruction?.code ?? "—"} — dự kiến {r.expectedEndSession ? WORK_SESSION_LABELS[r.expectedEndSession].toLowerCase() : ""}{" "}
                        {r.expectedEndDate ? format(new Date(r.expectedEndDate), "dd/MM/yyyy", { locale: vi }) : ""}
                      </>
                    ) : (
                      <div className="space-y-0.5">
                        {r.slots.map((s, i) => (
                          <div key={i}>{format(new Date(s.date), "EEEE dd/MM", { locale: vi })}: {s.startTime} - {s.endTime}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground whitespace-nowrap">{format(new Date(r.createdAt), "dd/MM/yyyy HH:mm", { locale: vi })}</td>
                  <td className="px-3 py-2">
                    <Badge variant={STATUS_BADGE_VARIANT[r.status]}>{EXTRA_WORK_REQUEST_STATUS_LABELS[r.status]}</Badge>
                    {r.respondedBy && r.status !== "PENDING" && (
                      <p className="text-xs text-text-muted mt-0.5">bởi {r.respondedBy.name}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "PENDING" && (
                      <div className="flex gap-1 justify-end">
                        {r.type === "EARLY_COMPLETION" ? (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={processingId === r.id} onClick={() => respond(r.id, "reject")} title="Từ chối">
                              {processingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="sm" className="h-7 bg-primary hover:bg-primary-hover" disabled={processingId === r.id} onClick={() => respond(r.id, "confirm")}>
                              {processingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Xác nhận</>}
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-destructive" disabled={processingId === r.id} onClick={() => respond(r.id, "reject")} title="Từ chối">
                              {processingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="sm" className="h-7 bg-primary hover:bg-primary-hover" disabled={processingId === r.id} onClick={() => respond(r.id, "approve")}>
                              {processingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Check className="w-3.5 h-3.5 mr-1" /> Đồng ý</>}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
