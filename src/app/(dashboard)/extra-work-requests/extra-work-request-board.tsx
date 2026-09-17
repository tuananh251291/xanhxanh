"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Check, X, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import Link from "next/link";
import { EXTRA_WORK_REQUEST_STATUS_LABELS, WORK_SESSION_LABELS, EXTRA_WORK_PURPOSE_LABELS } from "@/types";

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
  purpose: "COMPLETE_MAIN_INSTRUCTION" | "INCREASE_OUTPUT" | null;
  fulfilledAt: string | null;
  fulfilledInstruction: { code: string } | null;
  fulfilledRepackInstruction: { code: string } | null;
  fulfilledSealingTask: { code: string } | null;
};

// Nhãn + mã việc đã gán, đúng 1 trong 3 field fulfilledXxx có giá trị (xem ExtraWorkRequest.fulfilledAt,
// prisma/schema.prisma).
function fulfilledWorkLabel(r: Request): string {
  if (r.fulfilledInstruction) return `Chỉ định cấy dự phòng — ${r.fulfilledInstruction.code}`;
  if (r.fulfilledRepackInstruction) return `Chỉ định cấy xử lý — ${r.fulfilledRepackInstruction.code}`;
  if (r.fulfilledSealingTask) return `Việc hàn túi — ${r.fulfilledSealingTask.code}`;
  return "—";
}

const STATUS_BADGE_VARIANT = {
  PENDING: "in-progress",
  APPROVED: "completed",
  REJECTED: "overdue",
} as const;

export default function ExtraWorkRequestBoard() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [fulfilledRequests, setFulfilledRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Chỉ lấy đăng ký của ĐÚNG TUẦN NÀY — đăng ký của tuần đã trôi qua không còn cần thao tác nữa
      // (tự động bị dọn hẳn sau đó, xem ensureExpiredExtraWorkRequestsCleaned). Ẩn hẳn đăng ký đã bị từ
      // chối khỏi bảng này — NV đã được báo qua Alert (xem PATCH [id]/route.ts), không cần Kho mô theo
      // dõi tiếp trong danh sách thao tác hàng ngày.
      const [pendingRes, fulfilledRes] = await Promise.all([
        fetch("/api/extra-work-requests?excludeRejected=true&week=current"),
        // Danh sách riêng "Đã giao nhiệm vụ" — không giới hạn theo tuần, xem lịch sử mọi lúc.
        fetch("/api/extra-work-requests?fulfilled=true"),
      ]);
      setRequests(await pendingRes.json());
      setFulfilledRequests(await fulfilledRes.json());
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

  // Danh sách "tuần này" chỉ hiện đăng ký CHƯA được giao việc thật — đã giao rồi thì chuyển hẳn xuống
  // danh sách "Đã giao nhiệm vụ" riêng bên dưới, tránh trùng lặp giữa 2 danh sách.
  const weekRequests = requests.filter((r) => !r.fulfilledAt);
  const pendingCount = weekRequests.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-0">
          <div className="px-4 pt-4 pb-1 text-sm text-text-muted">
            {weekRequests.length} đăng ký tuần này{pendingCount > 0 && <span className="text-warning-foreground font-medium"> · {pendingCount} chờ xử lý</span>}
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
              {weekRequests.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-text-muted">Chưa có đăng ký nào trong tuần này</td></tr>
              ) : weekRequests.map((r) => (
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
                        {r.purpose && (
                          <p className="font-medium text-foreground">{EXTRA_WORK_PURPOSE_LABELS[r.purpose]}</p>
                        )}
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
                    {/* Đã duyệt nhưng chưa gán việc thật (fulfilledAt null) — mở trang chọn "Giao thêm chỉ
                        định cấy" hoặc "Giao việc hàn túi" cho đúng đăng ký này. */}
                    {r.status === "APPROVED" && !r.fulfilledAt && (
                      <div className="flex justify-end">
                        <Link href={`/extra-work-requests/${r.id}/assign`}>
                          <Button size="sm" className="h-7 bg-primary hover:bg-primary-hover">
                            <Send className="w-3.5 h-3.5 mr-1" /> Giao việc
                          </Button>
                        </Link>
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

    <Card>
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-1 text-sm text-text-muted">
          {fulfilledRequests.length} đăng ký đã giao nhiệm vụ
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">NV</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base whitespace-nowrap">Loại đăng ký</th>
                <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Việc đã giao</th>
              </tr>
            </thead>
            <tbody>
              {fulfilledRequests.length === 0 ? (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-text-muted">Chưa giao nhiệm vụ nào</td></tr>
              ) : fulfilledRequests.map((r) => (
                <tr key={r.id} className="border-b border-divider last:border-0 even:bg-background">
                  <td className="px-3 py-2 text-foreground whitespace-nowrap">
                    {r.staff.name} <span className="text-xs text-text-muted font-mono">({r.staff.code})</span>
                  </td>
                  <td className="px-3 py-2 text-foreground whitespace-nowrap">
                    {r.type === "EARLY_COMPLETION" ? "Hoàn thành sớm" : "Làm thêm ngoài giờ"}
                  </td>
                  <td className="px-3 py-2 text-text-secondary font-mono">{fulfilledWorkLabel(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
    </div>
  );
}
