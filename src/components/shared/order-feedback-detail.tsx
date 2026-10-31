"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { StarRating } from "@/components/shared/order-feedback-form";
import { isDefectRating, ORDER_FEEDBACK_CAUSE_LABELS, type OrderFeedbackCauseValue } from "@/lib/order-feedback-constants";

export type OrderFeedbackView = {
  id: string; rating: number; content: string | null; videoUrl: string | null; photoUrls: string[];
  createdAt: string; createdByName: string;
  cause: OrderFeedbackCauseValue | null; causeExplanation: string | null; causeAt: string | null; causeByName: string | null;
};

const CAUSES: OrderFeedbackCauseValue[] = ["FINISHED_WAREHOUSE", "PRODUCTION"];

// Chi tiết 1 phản hồi khách hàng + phần nguyên nhân lỗi. canExplain (QL Kho thành phẩm) + chưa xác nhận → nút
// "Xác nhận nguyên nhân": chọn đúng 1 trong 2 nguyên nhân + nội dung giải trình (PATCH /api/order-feedbacks/[id]).
export default function OrderFeedbackDetail({ feedback, canExplain, onExplained }: { feedback: OrderFeedbackView; canExplain: boolean; onExplained?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cause, setCause] = useState<OrderFeedbackCauseValue | null>(null);
  const [explanation, setExplanation] = useState("");
  const [busy, setBusy] = useState(false);
  const defect = isDefectRating(feedback.rating);

  const submit = async () => {
    if (!cause) { toast.error("Chọn 1 nguyên nhân"); return; }
    if (!explanation.trim()) { toast.error("Nhập nội dung giải trình lỗi"); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/order-feedbacks/${feedback.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cause, explanation: explanation.trim() }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      setOpen(false);
      onExplained?.();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <StarRating value={feedback.rating} size="w-5 h-5" />
          <span className="font-medium">{feedback.rating}/5 sao</span>
          {defect ? <Badge variant="overdue">Đơn có lỗi</Badge> : <Badge variant="completed">Đạt</Badge>}
        </div>
        <p className="text-xs text-text-muted">Ghi nhận bởi {feedback.createdByName} · {format(new Date(feedback.createdAt), "HH:mm dd/MM/yyyy")}</p>
        {feedback.content && <p className="whitespace-pre-line rounded-lg border border-divider p-3 text-foreground">{feedback.content}</p>}
        {feedback.videoUrl && (
          <a href={feedback.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-info-foreground hover:underline break-all">
            <PlayCircle className="w-4 h-4 shrink-0" /> {feedback.videoUrl}
          </a>
        )}
        {feedback.photoUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {feedback.photoUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block w-24 h-24 rounded-lg overflow-hidden border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh từ Supabase Storage, không phải asset tĩnh */}
                <img src={url} alt="Ảnh khách gửi" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </div>

      {defect && (
        <div className="rounded-lg border border-divider p-3 space-y-2">
          <p className="font-bold text-primary-strong">Nguyên nhân lỗi</p>
          {feedback.cause ? (
            <>
              <Badge variant={feedback.cause === "FINISHED_WAREHOUSE" ? "in-progress" : "info"}>{ORDER_FEEDBACK_CAUSE_LABELS[feedback.cause]}</Badge>
              {feedback.causeExplanation && <p className="whitespace-pre-line text-foreground">{feedback.causeExplanation}</p>}
              <p className="text-xs text-text-muted">QL Kho thành phẩm {feedback.causeByName ?? ""} · {feedback.causeAt ? format(new Date(feedback.causeAt), "HH:mm dd/MM/yyyy") : ""}</p>
            </>
          ) : !canExplain ? (
            <p className="text-text-muted">Chờ QL Kho thành phẩm xác nhận nguyên nhân</p>
          ) : !open ? (
            <Button size="sm" onClick={() => setOpen(true)}><CheckCircle2 className="w-4 h-4 mr-1" /> Xác nhận nguyên nhân</Button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {CAUSES.map((c) => (
                  <Button key={c} type="button" size="sm" variant={cause === c ? "default" : "outline"} onClick={() => setCause(c)}>{ORDER_FEEDBACK_CAUSE_LABELS[c]}</Button>
                ))}
              </div>
              <div className="space-y-1">
                <Label>Nội dung giải trình lỗi</Label>
                <textarea
                  className="w-full min-h-24 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  maxLength={3000}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Huỷ</Button>
                <Button size="sm" disabled={busy} onClick={submit}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Xác nhận</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
