"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PackageCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ShipOrderButton({ orderId, disabled }: { orderId: string; disabled: boolean }) {
  const [shipping, setShipping] = useState(false);
  const router = useRouter();

  const ship = async () => {
    setShipping(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ship" }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xuất kho — đơn hàng đã hoàn tất");
      router.refresh();
    } finally {
      setShipping(false);
    }
  };

  return (
    <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={disabled || shipping} onClick={ship}>
      {shipping ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
      Xuất kho
    </Button>
  );
}
