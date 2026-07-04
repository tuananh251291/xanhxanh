"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export default function ConfirmMotherReceivedButton({ instructionId }: { instructionId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmMotherReceived: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận mẫu mẹ");
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={confirm}>
      {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-1" />}
      Xác nhận đã nhận mẫu mẹ
    </Button>
  );
}
