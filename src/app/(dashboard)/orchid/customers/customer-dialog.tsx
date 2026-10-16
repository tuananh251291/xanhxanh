"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, Textarea, MoneyInput, useOrchidAction } from "@/components/orchid/ui";
import { formatVND } from "@/lib/orchid/labels";

export type CustomerFormItem = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: number | null;
  paymentTermDays: number;
  companyName: string | null;
  taxCode: string | null;
  invoiceAddress: string | null;
  invoiceEmail: string | null;
  note: string | null;
  isActive: boolean;
  loginEmail: string | null;
  prices: { productId: string; price: number }[];
};

type ProductOption = { id: string; code: string; name: string; basePrice: number };

export default function CustomerDialog({ item, products }: { item?: CustomerFormItem; products: ProductOption[] }) {
  const init = (c?: CustomerFormItem) => ({
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    creditLimit: c?.creditLimit ?? null,
    paymentTermDays: c?.paymentTermDays ?? 0,
    companyName: c?.companyName ?? "",
    taxCode: c?.taxCode ?? "",
    invoiceAddress: c?.invoiceAddress ?? "",
    invoiceEmail: c?.invoiceEmail ?? "",
    note: c?.note ?? "",
    isActive: c?.isActive ?? true,
    loginEmail: c?.loginEmail ?? "",
    loginPassword: "",
    prices: Object.fromEntries((c?.prices ?? []).map((p) => [p.productId, p.price])) as Record<string, number | null>,
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(init(item));
  const [showPrices, setShowPrices] = useState(false);
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hasLogin = !!item?.loginEmail;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nhập tên khách hàng");
    if (!hasLogin && form.loginEmail && form.loginPassword.length < 6) return toast.error("Mật khẩu đăng nhập tối thiểu 6 ký tự");
    const prices = Object.entries(form.prices).filter(([, v]) => v != null).map(([productId, price]) => ({ productId, price: price as number }));
    const { prices: _ignored, ...rest } = form;
    void _ignored;
    const ok = await run(
      item ? `/api/orchid/customers/${item.id}` : "/api/orchid/customers",
      { method: item ? "PATCH" : "POST", body: { ...rest, loginEmail: hasLogin ? null : form.loginEmail, prices } },
      "Đã lưu khách hàng"
    );
    if (ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(init(item)); }}>
      <DialogTrigger render={item ? <Button variant="ghost" size="sm" /> : <Button />}>
        {item ? <><Pencil className="w-4 h-4 mr-1" />Sửa</> : <><Plus className="w-4 h-4 mr-1" />Thêm khách hàng</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? `Sửa khách hàng ${item.code}` : "Thêm khách hàng lan"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Tên khách hàng"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Số điện thoại"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Email liên hệ"><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Địa chỉ giao hàng mặc định"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label="Hạn mức công nợ (đ)" hint="Để trống = không giới hạn">
              <MoneyInput value={form.creditLimit} onChange={(v) => set("creditLimit", v)} placeholder="Không giới hạn" />
            </Field>
            <Field label="Số ngày được nợ" hint="Ngày đến hạn = ngày giao + số ngày này">
              <Input type="number" min={0} value={form.paymentTermDays} onChange={(e) => set("paymentTermDays", Number(e.target.value))} />
            </Field>
          </div>

          <div className="rounded-lg border border-divider p-3 space-y-3">
            <p className="text-sm font-semibold text-primary-strong">Thông tin xuất hoá đơn mặc định</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Tên đơn vị"><Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>
              <Field label="Mã số thuế"><Input value={form.taxCode} onChange={(e) => set("taxCode", e.target.value)} /></Field>
              <Field label="Địa chỉ xuất hoá đơn"><Input value={form.invoiceAddress} onChange={(e) => set("invoiceAddress", e.target.value)} /></Field>
              <Field label="Email nhận hoá đơn"><Input value={form.invoiceEmail} onChange={(e) => set("invoiceEmail", e.target.value)} /></Field>
            </div>
          </div>

          <div className="rounded-lg border border-divider p-3 space-y-3">
            <p className="text-sm font-semibold text-primary-strong">Tài khoản đăng nhập của khách</p>
            {hasLogin ? (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Email đăng nhập"><Input value={item!.loginEmail!} disabled /></Field>
                <Field label="Đặt lại mật khẩu" hint="Để trống = giữ nguyên"><Input type="text" value={form.loginPassword} onChange={(e) => set("loginPassword", e.target.value)} /></Field>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Email đăng nhập" hint="Để trống nếu chưa cấp tài khoản"><Input value={form.loginEmail} onChange={(e) => set("loginEmail", e.target.value)} placeholder="khach@email.com" /></Field>
                <Field label="Mật khẩu"><Input type="text" value={form.loginPassword} onChange={(e) => set("loginPassword", e.target.value)} placeholder="Tối thiểu 6 ký tự" /></Field>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-divider p-3 space-y-3">
            <button type="button" className="text-sm font-semibold text-primary-strong underline" onClick={() => setShowPrices((v) => !v)}>
              Giá bán riêng cho khách này ({Object.values(form.prices).filter((v) => v != null).length} sản phẩm) {showPrices ? "▲" : "▼"}
            </button>
            {showPrices && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                <p className="text-xs text-text-muted">Để trống = dùng giá theo mốc số lượng chung của sản phẩm.</p>
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm truncate"><span className="font-mono text-xs text-info-foreground">{p.code}</span> {p.name}</span>
                    <span className="text-xs text-text-muted w-28 text-right">Giá chung {formatVND(p.basePrice)}</span>
                    <MoneyInput className="w-36" value={form.prices[p.id] ?? null} placeholder="—" onChange={(v) => set("prices", { ...form.prices, [p.id]: v })} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Ghi chú"><Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          {item && (
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={form.isActive} onCheckedChange={(v) => set("isActive", !!v)} />Đang giao dịch (bỏ chọn = khoá cả tài khoản đăng nhập)
            </Label>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
