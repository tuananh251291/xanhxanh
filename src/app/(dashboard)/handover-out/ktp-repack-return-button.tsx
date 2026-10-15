"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function KtpRepackReturnButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handover = async () => {
    if (!window.confirm(`Bàn giao kết quả phiếu ${code} về Kho thành phẩm? Số lượng sẽ được trừ khỏi giàn Phòng đợi xử lý.`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/repack-instructions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnToKtp: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã bàn giao — chờ Kho thành phẩm nhận lại");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover shrink-0" disabled={submitting} onClick={handover}>
      {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
      Bàn giao về Kho TP
    </Button>
  );
}
