"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Xác nhận nhận mẫu mẹ — TÁCH RIÊNG khỏi việc bấm "Xem" ở /my-instructions (trước đây 1 nút vừa xem vừa
// tự động xác nhận luôn, dễ bấm nhầm khi chưa kịp đọc kỹ phiếu). Giờ NV cấy mô phải chủ động tích "Tôi
// xác nhận..." rồi mới bấm được "Nhận bàn giao" — xem PATCH /api/instructions/[id] { confirmMotherReceived }.
export default function ConfirmMotherReceivedPanel({ instructionId }: { instructionId: string }) {
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmMotherReceived: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận mẫu mẹ");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="print:hidden space-y-3 rounded-lg border border-divider bg-background p-4">
      <label className="flex items-start gap-2 cursor-pointer">
        <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} className="mt-0.5" />
        <span className="text-sm font-medium text-foreground">
          Tôi xác nhận đã nhận đủ số lượng và hiểu rõ chỉ định cấy
        </span>
      </label>
      <p className="text-sm font-bold text-destructive">
        Lưu ý: Nếu bạn thấy chỉ định cấy không hợp lệ hãy thông báo lại cho Nhân viên kỹ thuật.
      </p>
      <Button
        className="bg-primary hover:bg-primary-hover"
        disabled={!confirmed || loading}
        onClick={onConfirm}
      >
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-2" />}
        Nhận bàn giao
      </Button>
    </div>
  );
}
