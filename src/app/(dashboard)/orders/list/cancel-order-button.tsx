"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CancelOrderButton({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();

  const cancel = async () => {
    if (!window.confirm(`Xóa đơn ${orderCode}? Toàn bộ số lượng đang tạm giữ sẽ trả lại tồn đạt tiêu chuẩn ngay.`)) return;

    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xóa đơn tạm giữ");
      router.refresh();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Button size="sm" variant="outline" className="h-8 text-destructive hover:bg-danger-light" disabled={cancelling} onClick={cancel}>
      {cancelling ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
      Xóa
    </Button>
  );
}
