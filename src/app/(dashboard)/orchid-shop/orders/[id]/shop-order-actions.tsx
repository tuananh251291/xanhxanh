"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, useOrchidAction } from "@/components/orchid/ui";

export default function ShopOrderActions({ orderId, mode }: { orderId: string; mode: "confirm" | "cancel" }) {
  const { run, pending } = useOrchidAction();
  const [message, setMessage] = useState("");
  const act = (action: "accept" | "reject" | "cancel", msg: string) => run(`/api/orchid/shop/orders/${orderId}`, { method: "PATCH", body: { action, message: message || null } }, msg);

  if (mode === "cancel") {
    return (
      <Button variant="outline" className="text-destructive" disabled={pending} onClick={() => confirm("Huỷ đơn đặt hàng này?") && act("cancel", "Đã huỷ đơn")}>
        Huỷ đơn đặt hàng
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <Textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Phản hồi cho nhân viên (không bắt buộc)" />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => act("accept", "Đã xác nhận đơn hàng")}>Đồng ý đơn đã điều chỉnh</Button>
        <Button variant="outline" className="text-destructive" disabled={pending} onClick={() => confirm("Từ chối và huỷ đơn này?") && act("reject", "Đã từ chối đơn")}>
          Từ chối
        </Button>
      </div>
    </div>
  );
}
