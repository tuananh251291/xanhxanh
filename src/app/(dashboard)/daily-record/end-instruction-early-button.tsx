"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, OctagonX } from "lucide-react";
import { toast } from "sonner";

// Dành cho NV cấy mô nghỉ đột xuất giữa tuần, không làm nốt các ngày còn lại của chỉ định (VD hết Thứ 7
// mà không đi làm Chủ nhật thì bấm) — thay vì để chỉ định treo "Đang thực hiện" tới tận khi hệ thống tự
// đóng lúc sang tuần mới (xem ensureInstructionsEnded). Xem PATCH /api/instructions/[id] nhánh endEarly.
export default function EndInstructionEarlyButton({
  instructionId, instructionCode, onEnded,
}: {
  instructionId: string;
  instructionCode: string;
  onEnded: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const endEarly = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn kết thúc sớm chỉ định ${instructionCode} không?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endEarly: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã kết thúc sớm chỉ định ${instructionCode}`);
      onEnded();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      className="w-full bg-destructive hover:bg-destructive/90 text-black"
      disabled={loading}
      onClick={endEarly}
    >
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <OctagonX className="w-4 h-4 mr-2" />}
      Kết thúc chỉ định sớm
    </Button>
  );
}
