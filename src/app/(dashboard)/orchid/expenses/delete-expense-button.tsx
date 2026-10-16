"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrchidAction } from "@/components/orchid/ui";

export default function DeleteExpenseButton({ id, code }: { id: string; code: string }) {
  const { run, pending } = useOrchidAction();
  return (
    <Button variant="ghost" size="icon" disabled={pending} onClick={() => confirm(`Xoá khoản chi ${code}?`) && run(`/api/orchid/expenses/${id}`, { method: "DELETE" }, "Đã xoá khoản chi")}>
      <Trash2 className="w-4 h-4 text-destructive" />
    </Button>
  );
}
