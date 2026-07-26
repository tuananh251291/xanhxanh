"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Ban } from "lucide-react";
import { toast } from "sonner";

// Chỉ hiện ở nơi đã lọc sẵn handedOverAt còn null (xem instructions/list/page.tsx) — server cũng tự
// chặn nếu đã bàn giao, xem PATCH /api/instructions/[id] nhánh cancelInstruction.
export default function CancelInstructionButton({ instructionId, instructionCode }: { instructionId: string; instructionCode: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const cancel = async () => {
    if (!window.confirm(`Hủy chỉ định ${instructionCode}? Kệ nguồn sẽ được giải phóng (hiện lại trong danh sách đến hạn cấy chuyển và cho phép sắp xếp lại).`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelInstruction: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      if (json.mediumOrderLocked) {
        toast.warning("Đã hủy chỉ định — nhưng đơn môi trường liên quan đã được NV môi trường xác nhận nên KHÔNG tự cập nhật số lượng, cần báo NV môi trường điều chỉnh thủ công nếu cần.");
      } else {
        toast.success(`Đã hủy chỉ định ${instructionCode}`);
      }
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Button size="sm" variant="outline" className="h-8 text-destructive hover:bg-danger-light" disabled={loading} onClick={cancel}>
      {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Ban className="w-3.5 h-3.5 mr-1.5" />}
      Hủy
    </Button>
  );
}
