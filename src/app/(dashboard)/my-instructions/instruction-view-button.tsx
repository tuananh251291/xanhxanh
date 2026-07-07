"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, PackageCheck } from "lucide-react";
import { toast } from "sonner";

export default function InstructionViewButton({
  instructionId,
  needsConfirm,
}: {
  instructionId: string;
  needsConfirm: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (!needsConfirm) {
    return (
      <Link href={`/instructions/${instructionId}`}>
        <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1" /> Xem</Button>
      </Link>
    );
  }

  const confirmAndView = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/instructions/${instructionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmMotherReceived: true }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận mẫu mẹ");
      router.push(`/instructions/${instructionId}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" className="bg-primary hover:bg-primary-hover" disabled={loading} onClick={confirmAndView}>
      {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PackageCheck className="w-4 h-4 mr-1" />}
      Xem và Xác nhận bàn giao
    </Button>
  );
}
