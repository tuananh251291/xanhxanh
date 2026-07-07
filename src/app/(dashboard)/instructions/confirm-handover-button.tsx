"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

export default function ConfirmHandoverButton({ instructionId }: { instructionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmHandover: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã bàn giao chỉ định cho nhân viên cấy mô");
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={loading} onClick={confirm}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
      Bàn giao
    </Button>
  );
}
