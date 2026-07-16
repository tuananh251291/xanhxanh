"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CompleteProcessingRequestButton({ requestId }: { requestId: string }) {
  const [completing, setCompleting] = useState(false);
  const router = useRouter();

  const complete = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/order-processing-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã hoàn thành — số dư đã được cộng vào kho khả dụng (T01)");
      router.refresh();
    } finally {
      setCompleting(false);
    }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={completing} onClick={complete}>
      {completing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
      Hoàn thành
    </Button>
  );
}
