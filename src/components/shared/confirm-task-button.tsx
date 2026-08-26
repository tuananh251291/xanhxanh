"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Nút "Xác nhận" ở "Công việc hôm nay của bạn" — NV bấm để báo đã nhận việc, sau đó Quản lý kho thành
// phẩm KHÔNG đổi được người phụ trách nữa (xem KhoTpAssignCell + PATCH action=ack của 4 route
// goods-receipts/transfers/orders/daily-tasks).
export default function ConfirmTaskButton({ endpoint }: { endpoint: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ack" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận việc");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" className="h-8" disabled={loading} onClick={confirm}>
      {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1.5" />}
      Xác nhận
    </Button>
  );
}
