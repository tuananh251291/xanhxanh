"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function SurplusHandoverButton({ instructionId, surplus }: { instructionId: string; surplus: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}/surplus-handover`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã bàn giao ${surplus.toLocaleString("vi-VN")} mẫu mẹ dư cho Kho mô`);
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Button size="sm" className="bg-warning text-warning-foreground hover:bg-warning-hover" disabled={loading} onClick={submit}>
      {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
      Bàn giao MM dư ({surplus.toLocaleString("vi-VN")})
    </Button>
  );
}
