"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";

export default function CancelRepackButton({ instructionId, instructionCode }: { instructionId: string; instructionCode: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const cancel = async () => {
    if (!window.confirm(`Hủy chỉ định cấy xử lý ${instructionCode}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/repack-instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã hủy chỉ định ${instructionCode}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" className="text-destructive border-destructive hover:bg-danger-light" disabled={loading} onClick={cancel}>
      {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
      Hủy chỉ định
    </Button>
  );
}
