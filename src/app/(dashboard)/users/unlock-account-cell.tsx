"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LockKeyholeOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function UnlockAccountCell({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const unlock = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockAccount: true }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã mở khóa tài khoản");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/40 hover:bg-danger-light" disabled={loading} onClick={unlock}>
      {loading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <LockKeyholeOpen className="w-3.5 h-3.5 mr-1" />}
      Mở khóa
    </Button>
  );
}
