"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect, Textarea, MoneyInput } from "@/components/orchid/ui";
import { formatVND, resolveOrchidPrice, computeOrderTotals } from "@/lib/orchid/labels";

type Customer = { id: string; code: string; name: string; address: string | null; phone: string | null; companyName: string | null; taxCode: string | null; invoiceAddress: string | null; invoiceEmail: string | null };
type Product = { id: string; code: string; name: string; unit: string; available: number; priceTiers: { minQuantity: number; price: number }[] };
type Line = { productId: string; quantity: number; unitPrice: number | null; manualPrice: boolean };

export type OrderFormInitial = {
  customerId: string;
  shippingAddress: string;
  phone: string;
  note: string;
  internalNote: string;
  needInvoice: boolean;
  vatRate: number;
  items: { productId: string; quantity: number; unitPrice: number }[];
};

// mode "create": tạo đơn mới (lưu nháp / chốt luôn). mode "edit": sửa đơn chưa xuất kho (PATCH action update).
export default function OrchidOrderForm({
  customers,
  products,
  customerPrices,
  initial,
  orderId,
}: {
  customers: Customer[];
  products: Product[];
  customerPrices: { customerId: string; productId: string; price: number }[];
  initial?: OrderFormInitial;
  orderId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<"draft" | "confirm" | "edit" | null>(null);
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const preset = !orderId ? customers.find((c) => c.id === initial?.customerId) : undefined;
  const [info, setInfo] = useState({
    shippingAddress: initial?.shippingAddress ?? "",
    phone: initial?.phone ?? "",
    note: initial?.note ?? "",
    internalNote: initial?.internalNote ?? "",
    needInvoice: initial?.needInvoice ?? false,
    vatRate: initial?.vatRate ?? 0,
    invoiceCompanyName: preset?.companyName ?? "",
    invoiceTaxCode: preset?.taxCode ?? "",
    invoiceAddress: preset?.invoiceAddress ?? "",
    invoiceEmail: preset?.invoiceEmail ?? "",
  });
  const [lines, setLines] = useState<Line[]>(
    initial?.items.length
      ? initial.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, manualPrice: true }))
      : [{ productId: "", quantity: 1, unitPrice: null, manualPrice: false }]
  );

  const priceFor = (productId: string, quantity: number, cid = customerId) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    return resolveOrchidPrice(p.priceTiers, quantity, customerPrices.find((c) => c.customerId === cid && c.productId === productId)?.price);
  };
  const effective = lines.map((l) => ({ ...l, unitPrice: l.manualPrice ? l.unitPrice ?? 0 : priceFor(l.productId, l.quantity) }));
  const totals = computeOrderTotals(effective.filter((l) => l.productId), info.vatRate);

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c && !orderId) {
      setInfo((f) => ({
        ...f,
        shippingAddress: c.address ?? "",
        phone: c.phone ?? "",
        invoiceCompanyName: c.companyName ?? "",
        invoiceTaxCode: c.taxCode ?? "",
        invoiceAddress: c.invoiceAddress ?? "",
        invoiceEmail: c.invoiceEmail ?? "",
      }));
    }
  }
  const setLine = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  async function save(kind: "draft" | "confirm" | "edit") {
    if (!customerId) return toast.error("Chọn khách hàng");
    const items = effective.filter((l) => l.productId).map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice }));
    if (items.length === 0) return toast.error("Thêm ít nhất 1 sản phẩm");
    setSaving(kind);
    try {
      const res = await fetch(orderId ? `/api/orchid/orders/${orderId}` : "/api/orchid/orders", {
        method: orderId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderId ? { action: "update", ...info, items } : { customerId, ...info, items, confirm: kind === "confirm" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(data.message ?? "Có lỗi xảy ra");
      toast.success(orderId ? "Đã cập nhật đơn hàng" : kind === "confirm" ? "Đã tạo và xác nhận đơn" : "Đã lưu nháp đơn hàng");
      router.push(`/orchid/orders/${orderId ?? data.id}`);
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid sm:grid-cols-2 gap-3">
          <Field label="Khách hàng">
            <NativeSelect value={customerId} onChange={(e) => pickCustomer(e.target.value)} disabled={!!orderId}>
              <option value="">— Chọn khách hàng —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Số điện thoại"><Input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} /></Field>
          <Field label="Địa chỉ giao hàng" className="sm:col-span-2"><Input value={info.shippingAddress} onChange={(e) => setInfo({ ...info, shippingAddress: e.target.value })} /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-semibold text-text-secondary">
            <span className="col-span-5">Sản phẩm</span><span className="col-span-2">Số lượng</span><span className="col-span-2">Đơn giá</span><span className="col-span-2 text-right">Thành tiền</span>
          </div>
          {effective.map((l, idx) => {
            const p = products.find((x) => x.id === l.productId);
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-12 sm:col-span-5">
                  <NativeSelect value={l.productId} onChange={(e) => setLine(idx, { productId: e.target.value, manualPrice: false })}>
                    <option value="">— Chọn sản phẩm —</option>
                    {products.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name} (khả dụng {x.available})</option>)}
                  </NativeSelect>
                  {p && l.quantity > p.available && <p className="text-xs text-warning-foreground mt-0.5">Vượt tồn khả dụng ({p.available})</p>}
                </div>
                <Input className="col-span-4 sm:col-span-2" type="number" min={1} value={l.quantity} onChange={(e) => setLine(idx, { quantity: Math.max(1, Number(e.target.value)) })} />
                <MoneyInput className="col-span-4 sm:col-span-2" value={l.unitPrice} onChange={(v) => setLine(idx, { unitPrice: v, manualPrice: true })} />
                <span className="col-span-3 sm:col-span-2 text-right text-sm tabular-nums">{formatVND(l.quantity * l.unitPrice)}</span>
                <div className="col-span-1">
                  {lines.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { productId: "", quantity: 1, unitPrice: null, manualPrice: false }])}>
              <Plus className="w-4 h-4 mr-1" />Thêm sản phẩm
            </Button>
            <p className="text-xs text-text-muted">Đơn giá tự lấy theo giá riêng của khách / mốc số lượng — sửa tay được.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 grid sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={info.needInvoice} onCheckedChange={(v) => setInfo({ ...info, needInvoice: !!v, vatRate: v ? info.vatRate || 8 : 0 })} />Có xuất hoá đơn
            </Label>
            {info.needInvoice && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="VAT (%)"><Input type="number" min={0} max={100} value={info.vatRate} onChange={(e) => setInfo({ ...info, vatRate: Number(e.target.value) })} /></Field>
                {!orderId && (
                  <>
                    <Field label="Tên đơn vị"><Input value={info.invoiceCompanyName} onChange={(e) => setInfo({ ...info, invoiceCompanyName: e.target.value })} /></Field>
                    <Field label="MST"><Input value={info.invoiceTaxCode} onChange={(e) => setInfo({ ...info, invoiceTaxCode: e.target.value })} /></Field>
                    <Field label="Email nhận HĐ"><Input value={info.invoiceEmail} onChange={(e) => setInfo({ ...info, invoiceEmail: e.target.value })} /></Field>
                    <Field label="Địa chỉ xuất HĐ" className="col-span-2"><Input value={info.invoiceAddress} onChange={(e) => setInfo({ ...info, invoiceAddress: e.target.value })} /></Field>
                  </>
                )}
              </div>
            )}
            <Field label="Ghi chú (khách xem được)"><Textarea rows={2} value={info.note} onChange={(e) => setInfo({ ...info, note: e.target.value })} /></Field>
            <Field label="Ghi chú nội bộ"><Textarea rows={2} value={info.internalNote} onChange={(e) => setInfo({ ...info, internalNote: e.target.value })} /></Field>
          </div>
          <div className="rounded-lg bg-primary-light p-4 space-y-2 self-start">
            <div className="flex justify-between text-sm"><span>Tạm tính</span><span className="tabular-nums">{formatVND(totals.subtotal)}</span></div>
            <div className="flex justify-between text-sm"><span>VAT {info.vatRate}%</span><span className="tabular-nums">{formatVND(totals.vatAmount)}</span></div>
            <div className="flex justify-between text-lg font-bold text-primary-strong border-t border-divider pt-2"><span>Tổng cộng</span><span className="tabular-nums">{formatVND(totals.total)}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        {orderId ? (
          <Button onClick={() => save("edit")} disabled={!!saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu thay đổi</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => save("draft")} disabled={!!saving}>{saving === "draft" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu nháp</Button>
            <Button onClick={() => save("confirm")} disabled={!!saving}>{saving === "confirm" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Tạo & xác nhận đơn</Button>
          </>
        )}
      </div>
    </div>
  );
}
