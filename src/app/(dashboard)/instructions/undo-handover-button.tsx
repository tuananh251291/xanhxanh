"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";

// Chỉ hiện khi đã bàn giao (handedOverAt) nhưng NV cấy mô CHƯA xác nhận nhận mẫu mẹ (motherReceivedAt
// còn null) — xem instructions/page.tsx. Server cũng tự chặn nếu đã xác nhận, xem PATCH
// /api/instructions/[id] nhánh undoHandover.
export default function UndoHandoverButton({ instructionId, instructionCode }: { instructionId: string; instructionCode: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const undo = async () => {
    if (!window.confirm(`Hoàn tác bàn giao chỉ định ${instructionCode}? Mẫu mẹ nguồn sẽ trở lại tồn kệ, chỉ định chuyển về "Chưa bàn giao".`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoHandover: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã hoàn tác bàn giao ${instructionCode}`);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Button size="sm" variant="outline" className="h-8 text-warning-foreground hover:bg-warning-light" disabled={loading} onClick={undo}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Undo2 className="w-3.5 h-3.5 mr-1.5" />}
      Hoàn tác
    </Button>
  );
}
