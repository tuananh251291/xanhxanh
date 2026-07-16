"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ConfirmOrderButton({ orderId }: { orderId: string }) {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  const confirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(
        json.processingRequestCount > 0
          ? `Đã xác nhận đơn — ${json.processingRequestCount} dòng cần tách túi, đã gửi Yêu cầu xử lý sang Kho thành phẩm`
          : "Đã xác nhận đơn hàng"
      );
      router.refresh();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={confirming} onClick={confirm}>
      {confirming ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
      Xác nhận
    </Button>
  );
}
