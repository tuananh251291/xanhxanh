"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";

export default function KtpRepackHandoverActions({ id, code, canCancel }: { id: string; code: string; canCancel: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"handover" | "cancel" | null>(null);

  const call = async (kind: "handover" | "cancel") => {
    const ask = kind === "handover"
      ? `Bàn giao phiếu ${code} sang khu sản xuất? Số lượng sẽ được trừ khỏi Phòng chờ xử lý.`
      : `Hủy phiếu xử lý ${code}?`;
    if (!window.confirm(ask)) return;
    setBusy(kind);
    try {
      const res = await fetch(`/api/repack-instructions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "handover" ? { ktpHandover: true } : { cancel: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(kind === "handover" ? "Đã bàn giao — chờ Kho mô nhận" : "Đã hủy phiếu xử lý");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 shrink-0">
      {canCancel && (
        <Button size="sm" variant="outline" className="h-8 text-destructive" disabled={!!busy} onClick={() => call("cancel")}>
          {busy === "cancel" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <X className="w-3.5 h-3.5 mr-1.5" />}
          Hủy
        </Button>
      )}
      <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={!!busy} onClick={() => call("handover")}>
        {busy === "handover" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
        Bàn giao
      </Button>
    </div>
  );
}
