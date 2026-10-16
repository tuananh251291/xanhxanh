"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrchidCart } from "@/components/orchid/cart";
import { formatVND, resolveOrchidPrice } from "@/lib/orchid/labels";

export default function AddToCart({ productId, unit, priceTiers, customerPrice, stock }: {
  productId: string;
  unit: string;
  priceTiers: { minQuantity: number; price: number }[];
  customerPrice: number | null;
  stock: number | null;
}) {
  const { cart, add } = useOrchidCart();
  const [qty, setQty] = useState(priceTiers[0]?.minQuantity ?? 1);
  const inCart = cart[productId] ?? 0;
  const unitPrice = resolveOrchidPrice(priceTiers, qty + inCart, customerPrice);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input type="number" min={1} className="w-28" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
        <span className="text-sm text-text-secondary">{unit}</span>
        <Button
          onClick={() => {
            add(productId, qty);
            toast.success("Đã thêm vào giỏ hàng");
          }}
        >
          <ShoppingCart className="w-4 h-4 mr-1" />Thêm vào giỏ
        </Button>
      </div>
      <p className="text-sm text-text-secondary">
        Đơn giá áp dụng: <b className="text-foreground">{formatVND(unitPrice)}</b> · Thành tiền ≈ <b className="text-foreground">{formatVND(unitPrice * qty)}</b>
      </p>
      {stock != null && qty + inCart > stock && <p className="text-xs text-warning-foreground">Vượt số tồn hiện có — nhân viên sẽ liên hệ điều chỉnh khi duyệt đơn.</p>}
      {inCart > 0 && <p className="text-sm">Đã có {inCart} {unit} trong giỏ · <Link href="/orchid-shop/cart" className="underline text-info-foreground">Xem giỏ hàng</Link></p>}
    </div>
  );
}
