"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

// "Khách xác nhận / Chưa cọc": gửi đơn sang QL Kho TP kiểm tra đáp ứng (xem customerConfirmOrder ở PATCH /api/orders/[id]).
export default function CustomerConfirmButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "customer-confirm" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã gửi đơn cho Quản lý kho thành phẩm kiểm tra đáp ứng");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={busy} onClick={send}>
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Khách xác nhận / Chưa cọc
    </Button>
  );
}
