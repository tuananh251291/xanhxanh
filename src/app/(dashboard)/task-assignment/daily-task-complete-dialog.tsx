"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { DailyTaskType } from "@prisma/client";

export default function DailyTaskCompleteDialog({
  taskId,
  code,
  type,
  subtitle,
}: {
  taskId: string;
  code: string;
  type: DailyTaskType;
  subtitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [resultNotes, setResultNotes] = useState("");
  const [proposedAction, setProposedAction] = useState<"TRONG" | "HUY" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const submit = async () => {
    if (!resultNotes.trim()) { toast.error("Nhập ghi chú kết quả"); return; }
    if (type === "DE_XUAT_TRONG_HUY" && !proposedAction) { toast.error("Chọn đề xuất Trồng lại hoặc Hủy bỏ"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/daily-tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", resultNotes, proposedAction: proposedAction ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã hoàn thành nhiệm vụ");
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" />}>
        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Hoàn thành
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-mono">{code}</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-1">
          <p className="text-sm text-text-secondary">{subtitle}</p>

          {type === "DE_XUAT_TRONG_HUY" && (
            <div>
              <Label className="mb-1.5 block">Đề xuất</Label>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant={proposedAction === "TRONG" ? "default" : "outline"} className={proposedAction === "TRONG" ? "bg-primary hover:bg-primary-hover" : ""} onClick={() => setProposedAction("TRONG")}>
                  Trồng lại
                </Button>
                <Button type="button" size="sm" variant={proposedAction === "HUY" ? "default" : "outline"} className={proposedAction === "HUY" ? "bg-primary hover:bg-primary-hover" : ""} onClick={() => setProposedAction("HUY")}>
                  Hủy bỏ
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">{type === "DE_XUAT_TRONG_HUY" ? "Ghi chú đề xuất" : "Ghi chú kết quả kiểm tra"}</Label>
            <textarea
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              placeholder={type === "DE_XUAT_TRONG_HUY" ? "VD: Lô X có dấu hiệu héo, đề xuất hủy..." : "VD: Đã kiểm tra 5 lô, không phát hiện bất thường..."}
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <Button type="button" className="w-full bg-primary hover:bg-primary-hover" disabled={submitting} onClick={submit}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Xác nhận hoàn thành
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
