"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// QL Kho TP xử lý đơn đã cọc chưa đủ hàng: xuất trước phần đã có (phần còn lại giữ chỗ tới khi hàng về) hoặc huỷ đơn.
export default function OrderPartialActions({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (body: unknown, question: string) => {
    if (!window.confirm(question)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json?.partial ? `Đã xuất một phần — đơn ${json.shippedOrderCode}` : "Đã xử lý đơn");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "ship", partial: true }, `Xuất trước phần đã có của đơn ${orderCode}? Phần còn lại giữ chỗ tới khi hàng về.`)}>
        {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Xuất trước phần đã có
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => act({ action: "cancel" }, `Huỷ đơn ${orderCode}? Khách đã cọc, cần xử lý với khách sau khi huỷ.`)}>
        Huỷ đơn
      </Button>
    </div>
  );
}
