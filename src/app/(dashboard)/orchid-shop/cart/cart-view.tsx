"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, Textarea } from "@/components/orchid/ui";
import { useOrchidCart } from "@/components/orchid/cart";
import { formatVND, resolveOrchidPrice } from "@/lib/orchid/labels";
import type { OrchidShopProduct } from "@/lib/orchid/shop";

type Defaults = { shippingAddress: string; phone: string; invoiceCompanyName: string; invoiceTaxCode: string; invoiceAddress: string; invoiceEmail: string };

export default function CartView({ products, defaults }: { products: OrchidShopProduct[]; defaults: Defaults }) {
  const router = useRouter();
  const { cart, setQuantity, clear } = useOrchidCart();
  const [info, setInfo] = useState({ ...defaults, note: "", needInvoice: false });
  const [sending, setSending] = useState(false);

  const lines = Object.entries(cart)
    .map(([productId, quantity]) => ({ product: products.find((p) => p.id === productId), productId, quantity }))
    .filter((l) => l.quantity > 0);
  const missing = lines.filter((l) => !l.product);
  const valid = lines.filter((l) => l.product) as { product: OrchidShopProduct; productId: string; quantity: number }[];
  const total = valid.reduce((s, l) => s + l.quantity * resolveOrchidPrice(l.product.priceTiers, l.quantity, l.product.customerPrice), 0);

  async function submit() {
    if (valid.length === 0) return toast.error("Giỏ hàng trống");
    if (!info.shippingAddress.trim() || !info.phone.trim()) return toast.error("Nhập địa chỉ giao hàng và số điện thoại");
    setSending(true);
    try {
      const res = await fetch("/api/orchid/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...info, items: valid.map((l) => ({ productId: l.productId, quantity: l.quantity })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.message ?? "Gửi đơn thất bại");
      clear();
      toast.success(`Đã gửi đơn ${data.code} — chờ nhân viên duyệt`);
      router.push(`/orchid-shop/orders/${data.id}`);
    } finally {
      setSending(false);
    }
  }

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-text-muted">Giỏ hàng đang trống</p>
          <Link href="/orchid-shop"><Button>Xem danh mục sản phẩm</Button></Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-3">
        {missing.length > 0 && (
          <Card className="border-warning">
            <CardContent className="p-3 text-sm text-warning-foreground flex items-center justify-between">
              {missing.length} sản phẩm trong giỏ không còn bán
              <Button size="sm" variant="outline" onClick={() => missing.forEach((m) => setQuantity(m.productId, 0))}>Bỏ khỏi giỏ</Button>
            </CardContent>
          </Card>
        )}
        {valid.map((l) => {
          const unitPrice = resolveOrchidPrice(l.product.priceTiers, l.quantity, l.product.customerPrice);
          return (
            <Card key={l.productId}>
              <CardContent className="p-3 flex items-center gap-3">
                {l.product.imageUrls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.product.imageUrls[0]} alt="" className="w-16 h-16 rounded-lg object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-primary-light" />
                )}
                <div className="flex-1 min-w-0">
                  <Link href={`/orchid-shop/products/${l.productId}`} className="font-medium hover:underline">{l.product.name}</Link>
                  <p className="text-xs text-text-secondary">{formatVND(unitPrice)} / {l.product.unit}{l.product.stock != null && ` · còn ${l.product.stock}`}</p>
                  {l.product.stock != null && l.quantity > l.product.stock && <p className="text-xs text-warning-foreground">Vượt tồn hiện có</p>}
                </div>
                <Input type="number" min={1} className="w-24" value={l.quantity} onChange={(e) => setQuantity(l.productId, Math.max(1, Number(e.target.value)))} />
                <span className="w-28 text-right font-semibold tabular-nums">{formatVND(unitPrice * l.quantity)}</span>
                <Button variant="ghost" size="icon" onClick={() => setQuantity(l.productId, 0)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card className="self-start">
        <CardContent className="p-4 space-y-3">
          <Field label="Địa chỉ giao hàng"><Input value={info.shippingAddress} onChange={(e) => setInfo({ ...info, shippingAddress: e.target.value })} /></Field>
          <Field label="Số điện thoại"><Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></Field>
          <Field label="Ghi chú"><Textarea rows={2} value={info.note} onChange={(e) => setInfo({ ...info, note: e.target.value })} /></Field>
          <Label className="flex items-center gap-2 font-normal"><Checkbox checked={info.needInvoice} onCheckedChange={(v) => setInfo({ ...info, needInvoice: !!v })} />Cần xuất hoá đơn VAT</Label>
          {info.needInvoice && (
            <div className="space-y-2">
              <Field label="Tên đơn vị"><Input value={info.invoiceCompanyName} onChange={(e) => setInfo({ ...info, invoiceCompanyName: e.target.value })} /></Field>
              <Field label="Mã số thuế"><Input value={info.invoiceTaxCode} onChange={(e) => setInfo({ ...info, invoiceTaxCode: e.target.value })} /></Field>
              <Field label="Địa chỉ"><Input value={info.invoiceAddress} onChange={(e) => setInfo({ ...info, invoiceAddress: e.target.value })} /></Field>
              <Field label="Email nhận hoá đơn"><Input value={info.invoiceEmail} onChange={(e) => setInfo({ ...info, invoiceEmail: e.target.value })} /></Field>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold text-primary-strong border-t border-divider pt-3">
            <span>Tạm tính</span><span className="tabular-nums">{formatVND(total)}</span>
          </div>
          <p className="text-xs text-text-muted">Chưa gồm VAT (nếu có). Giá cuối cùng theo xác nhận của nhân viên.</p>
          <Button className="w-full" onClick={submit} disabled={sending}>{sending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Gửi đơn đặt hàng</Button>
        </CardContent>
      </Card>
    </div>
  );
}
