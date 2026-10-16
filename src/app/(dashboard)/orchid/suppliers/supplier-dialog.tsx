"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Textarea, useOrchidAction } from "@/components/orchid/ui";

type Supplier = { id: string; code: string; name: string; contactName: string | null; phone: string | null; address: string | null; paymentTermDays: number; note: string | null };

export default function SupplierDialog({ item }: { item?: Supplier }) {
  const blank = { name: "", contactName: "", phone: "", address: "", paymentTermDays: 30, note: "" };
  const fromItem = (s?: Supplier) =>
    s ? { name: s.name, contactName: s.contactName ?? "", phone: s.phone ?? "", address: s.address ?? "", paymentTermDays: s.paymentTermDays, note: s.note ?? "" } : blank;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fromItem(item));
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nhập tên nhà cung cấp");
    const ok = await run(item ? `/api/orchid/suppliers/${item.id}` : "/api/orchid/suppliers", { method: item ? "PATCH" : "POST", body: form }, "Đã lưu nhà cung cấp");
    if (ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(fromItem(item)); }}>
      <DialogTrigger render={item ? <Button variant="ghost" size="sm" /> : <Button />}>
        {item ? <><Pencil className="w-4 h-4 mr-1" />Sửa</> : <><Plus className="w-4 h-4 mr-1" />Thêm nhà cung cấp</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{item ? `Sửa ${item.code}` : "Thêm nhà cung cấp"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Tên nhà cung cấp"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Người liên hệ"><Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
            <Field label="Số điện thoại"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          </div>
          <Field label="Địa chỉ"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Số ngày được nợ" hint="Hạn thanh toán mặc định = ngày nhập + số ngày này">
            <Input type="number" min={0} value={form.paymentTermDays} onChange={(e) => set("paymentTermDays", Number(e.target.value))} />
          </Field>
          <Field label="Ghi chú"><Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
