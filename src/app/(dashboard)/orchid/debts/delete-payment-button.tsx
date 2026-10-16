"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrchidAction } from "@/components/orchid/ui";

export default function DeletePaymentButton({ id, kind }: { id: string; kind: "customer" | "supplier" | "point" }) {
  const { run, pending } = useOrchidAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      title="Xoá phiếu ghi nhầm"
      onClick={() => confirm("Xoá phiếu thu/chi này? Công nợ sẽ tính lại.") && run(`/api/orchid/payments/${id}?kind=${kind}`, { method: "DELETE" }, "Đã xoá phiếu")}
    >
      <Trash2 className="w-4 h-4 text-destructive" />
    </Button>
  );
}
