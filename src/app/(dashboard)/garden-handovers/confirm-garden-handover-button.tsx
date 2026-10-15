"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export default function ConfirmGardenHandoverButton({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    if (!window.confirm(`Xác nhận đã nhận đủ cây của phiếu ${code}?`)) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/garden-handovers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận cây");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={submitting} onClick={confirm}>
      {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
      Xác nhận đã nhận
    </Button>
  );
}
