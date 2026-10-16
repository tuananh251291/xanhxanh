"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrchidAction } from "@/components/orchid/ui";

// Xoá dòng bán/hỏng/báo tồn nhập nhầm (chỉ Admin cấp cao/NV Trợ lý).
export default function DeleteEntryButton({ id, kind }: { id: string; kind: "sale" | "damage" | "stock" }) {
  const { run, pending } = useOrchidAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={() => confirm("Xoá dòng này?") && run(`/api/orchid/retail-entries/${id}?kind=${kind}`, { method: "DELETE" }, "Đã xoá")}
    >
      <Trash2 className="w-4 h-4 text-destructive" />
    </Button>
  );
}
