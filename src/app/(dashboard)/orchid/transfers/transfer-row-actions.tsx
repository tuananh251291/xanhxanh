"use client";

import { Button } from "@/components/ui/button";
import { useOrchidAction } from "@/components/orchid/ui";

// Phiếu gửi điểm bán đang chờ: NV xác nhận nhận hộ (điểm bán chưa có tài khoản) hoặc huỷ (hoàn lô).
export default function TransferRowActions({ id, quantity }: { id: string; quantity: number }) {
  const { run, pending } = useOrchidAction();
  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          const v = prompt(`Số cây điểm bán thực nhận (tối đa ${quantity}):`, String(quantity));
          if (v === null) return;
          run(`/api/orchid/transfers/${id}`, { method: "PATCH", body: { action: "receive", receivedQuantity: Number(v) } }, "Đã xác nhận nhận hàng");
        }}
      >
        Nhận hộ
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => confirm("Huỷ phiếu gửi? Hàng được hoàn lại đúng lô đã trừ.") && run(`/api/orchid/transfers/${id}`, { method: "PATCH", body: { action: "cancel" } }, "Đã huỷ phiếu")}
      >
        Huỷ
      </Button>
    </div>
  );
}
