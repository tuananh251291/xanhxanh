"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// "Đặt hàng" NCC ngay trên chi tiết đơn — QL mở đơn từ thông báo Khách đã cọc (xem placeSupplierCheck).
export default function PlaceSupplierCheckButton({ checkId }: { checkId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const place = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/supplier-checks/${checkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "place" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã đặt hàng NCC");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" size="sm" disabled={busy} onClick={place}>
      {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />} Đặt hàng
    </Button>
  );
}
