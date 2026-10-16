"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrchidAction } from "@/components/orchid/ui";

export default function DeleteReceiptButton({ id, code }: { id: string; code: string }) {
  const { run, pending } = useOrchidAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      title="Xoá phiếu nhập"
      onClick={() => {
        if (confirm(`Xoá phiếu nhập ${code}? Chỉ xoá được khi chưa lô nào bị xuất/điều chuyển.`)) run(`/api/orchid/receipts/${id}`, { method: "DELETE" }, "Đã xoá phiếu nhập");
      }}
    >
      <Trash2 className="w-4 h-4 text-destructive" />
    </Button>
  );
}
