"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrchidAction } from "@/components/orchid/ui";

export default function ReceiveForm({ transferId, quantity }: { transferId: string; quantity: number }) {
  const [received, setReceived] = useState(quantity);
  const [note, setNote] = useState("");
  const { run, pending } = useOrchidAction();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0">Thực nhận</span>
        <Input type="number" min={0} max={quantity} className="w-28" value={received} onChange={(e) => setReceived(Number(e.target.value))} />
        <span className="text-sm">cây</span>
      </div>
      {received < quantity && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do nhận thiếu (hỏng, thiếu…)" />}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() => run(`/api/orchid/point/transfers/${transferId}`, { method: "PATCH", body: { receivedQuantity: received, note: note || null } }, "Đã xác nhận nhận hàng")}
      >
        Xác nhận đã nhận
      </Button>
    </div>
  );
}
