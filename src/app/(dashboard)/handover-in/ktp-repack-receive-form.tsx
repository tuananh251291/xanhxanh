"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export default function KtpRepackReceiveForm({ id, code, disabled }: { id: string; code: string; disabled: boolean }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const receive = async () => {
    if (!window.confirm(`Xác nhận đã nhận phiếu ${code} vào Phòng đợi xử lý?`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repack-instructions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ khoMoReceive: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã nhận ${code} vào Phòng đợi xử lý — vào Chỉ định cấy xử lý để gán NV cấy mô`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover shrink-0" disabled={submitting || disabled} onClick={receive}>
      {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
      Nhận vào Phòng đợi xử lý
    </Button>
  );
}
