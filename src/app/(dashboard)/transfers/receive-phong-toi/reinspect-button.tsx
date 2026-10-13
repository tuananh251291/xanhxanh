"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

// Kho mô "Kiểm tra lại" 1 phiếu bàn giao đã kiểm tra (nhập sai số nhiễm/không đạt...) — mở lại kết quả
// kiểm tra của các dòng chưa xếp kệ (xem reopenTransferInspection) rồi chuyển thẳng sang trang Kiểm tra.
export default function ReinspectButton({ transferId, transferCode, className }: { transferId: string; transferCode: string; className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const reopen = async () => {
    if (
      !window.confirm(
        `Kiểm tra lại phiếu ${transferCode}?\n\nKết quả kiểm tra cũ của các lô CHƯA xếp kệ sẽ bị huỷ: số nhiễm đã báo được trả lại về lô (rút khỏi Phòng nhiễm), rồi bạn nhập kết quả kiểm tra mới. Lô đã xếp kệ giữ nguyên.`
      )
    ) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/transfers/receive-phong-toi/inspect/${transferId}/reopen`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã mở lại phiếu ${transferCode} — nhập lại kết quả kiểm tra`);
      router.push(`/transfers/receive-phong-toi/inspect/${transferId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" className={className ?? "h-8"} disabled={loading} onClick={reopen}>
      {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
      Kiểm tra lại
    </Button>
  );
}
