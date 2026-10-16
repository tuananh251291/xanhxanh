"use client";

import { useState } from "react";
import type { OrchidInvoiceStatus } from "@prisma/client";
import { FileText, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect, Textarea, useOrchidAction, todayInputValue } from "@/components/orchid/ui";
import { ORCHID_INVOICE_STATUS_LABELS, toDateInputValue } from "@/lib/orchid/labels";

export type InvoiceOrder = {
  id: string;
  code: string;
  needInvoice: boolean;
  invoiceStatus: OrchidInvoiceStatus;
  invoiceCompanyName: string | null;
  invoiceTaxCode: string | null;
  invoiceAddress: string | null;
  invoiceEmail: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceNote: string | null;
};

// Cập nhật thông tin + trạng thái hoá đơn: Chưa xuất → Chờ xuất → Đã xuất → Đã gửi khách.
// (Sau này thay bằng gọi API hoá đơn điện tử.)
export default function InvoiceDialog({ order, size = "sm" }: { order: InvoiceOrder; size?: "sm" | "default" }) {
  const init = () => ({
    needInvoice: order.needInvoice,
    invoiceStatus: order.invoiceStatus,
    invoiceCompanyName: order.invoiceCompanyName ?? "",
    invoiceTaxCode: order.invoiceTaxCode ?? "",
    invoiceAddress: order.invoiceAddress ?? "",
    invoiceEmail: order.invoiceEmail ?? "",
    invoiceNumber: order.invoiceNumber ?? "",
    invoiceDate: order.invoiceDate ? toDateInputValue(order.invoiceDate) : "",
    invoiceNote: order.invoiceNote ?? "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(init);
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(`/api/orchid/orders/${order.id}`, { method: "PATCH", body: { action: "invoice", ...form } }, "Đã cập nhật hoá đơn");
    if (ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(init()); }}>
      <DialogTrigger render={<Button size={size} variant="outline" />}><FileText className="w-4 h-4 mr-1" />Cập nhật hoá đơn</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Hoá đơn đơn {order.code}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.needInvoice} onCheckedChange={(v) => set("needInvoice", !!v)} />Cần xuất hoá đơn
          </Label>
          {form.needInvoice && (
            <>
              <Field label="Trạng thái">
                <NativeSelect
                  value={form.invoiceStatus}
                  onChange={(e) => {
                    const s = e.target.value as OrchidInvoiceStatus;
                    setForm((f) => ({ ...f, invoiceStatus: s, invoiceDate: (s === "ISSUED" || s === "SENT") && !f.invoiceDate ? todayInputValue() : f.invoiceDate }));
                  }}
                >
                  {(Object.keys(ORCHID_INVOICE_STATUS_LABELS) as OrchidInvoiceStatus[]).map((s) => <option key={s} value={s}>{ORCHID_INVOICE_STATUS_LABELS[s]}</option>)}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tên đơn vị" className="col-span-2"><Input value={form.invoiceCompanyName} onChange={(e) => set("invoiceCompanyName", e.target.value)} /></Field>
                <Field label="MST"><Input value={form.invoiceTaxCode} onChange={(e) => set("invoiceTaxCode", e.target.value)} /></Field>
                <Field label="Email nhận hoá đơn"><Input value={form.invoiceEmail} onChange={(e) => set("invoiceEmail", e.target.value)} /></Field>
                <Field label="Địa chỉ" className="col-span-2"><Input value={form.invoiceAddress} onChange={(e) => set("invoiceAddress", e.target.value)} /></Field>
                <Field label="Số hoá đơn"><Input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} /></Field>
                <Field label="Ngày xuất"><Input type="date" value={form.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} /></Field>
              </div>
              <Field label="Ghi chú hoá đơn"><Textarea rows={2} value={form.invoiceNote} onChange={(e) => set("invoiceNote", e.target.value)} /></Field>
            </>
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
