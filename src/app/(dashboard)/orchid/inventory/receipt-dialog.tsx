"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Textarea, MoneyInput, useOrchidAction, todayInputValue } from "@/components/orchid/ui";
import { formatVND } from "@/lib/orchid/labels";

type Line = { productId: string; quantity: number; unitCost: number | null; note: string };

export default function ReceiptDialog({
  products,
  warehouses,
  suppliers,
}: {
  products: { id: string; code: string; name: string }[];
  warehouses: { id: string; code: string; name: string }[];
  suppliers: { id: string; name: string; paymentTermDays: number }[];
}) {
  const blank = () => ({
    supplierId: "",
    warehouseId: warehouses[0]?.id ?? "",
    receiptDate: todayInputValue(),
    dueDate: "",
    otherCost: null as number | null,
    note: "",
    lines: [{ productId: "", quantity: 1, unitCost: null, note: "" }] as Line[],
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (idx: number, patch: Partial<Line>) => set("lines", form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const total = form.lines.reduce((s, l) => s + l.quantity * (l.unitCost ?? 0), 0) + (form.otherCost ?? 0);
  const supplier = suppliers.find((s) => s.id === form.supplierId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.lines.some((l) => !l.productId || l.quantity < 1)) return toast.error("Chọn sản phẩm và số lượng cho mọi dòng");
    const ok = await run(
      "/api/orchid/receipts",
      {
        method: "POST",
        body: {
          ...form,
          supplierId: form.supplierId || null,
          dueDate: form.dueDate || null,
          otherCost: form.otherCost ?? 0,
          lines: form.lines.map((l) => ({ ...l, unitCost: l.unitCost ?? 0 })),
        },
      },
      "Đã tạo phiếu nhập và lô hàng"
    );
    if (ok) {
      setOpen(false);
      setForm(blank());
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus className="w-4 h-4 mr-1" />Tạo phiếu nhập</DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Phiếu nhập hàng</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <Field label="Nhà cung cấp" className="sm:col-span-2">
              <NativeSelect value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="">— Không có —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Kho nhập">
              <NativeSelect value={form.warehouseId} onChange={(e) => set("warehouseId", e.target.value)}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Ngày nhập"><Input type="date" value={form.receiptDate} onChange={(e) => set("receiptDate", e.target.value)} /></Field>
          </div>

          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-semibold text-text-secondary">
              <span className="col-span-5">Sản phẩm</span><span className="col-span-2">Số lượng</span><span className="col-span-2">Giá nhập/cây</span><span className="col-span-2">Ghi chú lô</span>
            </div>
            {form.lines.map((l, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <NativeSelect className="col-span-12 sm:col-span-5" value={l.productId} onChange={(e) => setLine(idx, { productId: e.target.value })}>
                  <option value="">— Chọn sản phẩm —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </NativeSelect>
                <Input className="col-span-4 sm:col-span-2" type="number" min={1} value={l.quantity} onChange={(e) => setLine(idx, { quantity: Number(e.target.value) })} />
                <MoneyInput className="col-span-4 sm:col-span-2" value={l.unitCost} onChange={(v) => setLine(idx, { unitCost: v })} />
                <Input className="col-span-3 sm:col-span-2" value={l.note} onChange={(e) => setLine(idx, { note: e.target.value })} />
                <div className="col-span-1">
                  {form.lines.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => set("lines", form.lines.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  )}
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => set("lines", [...form.lines, { productId: "", quantity: 1, unitCost: null, note: "" }])}>
              <Plus className="w-4 h-4 mr-1" />Thêm dòng (mỗi dòng = 1 lô)
            </Button>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Chi phí khác (vận chuyển, thuế…)" hint="Cộng vào số phải trả NCC"><MoneyInput value={form.otherCost} onChange={(v) => set("otherCost", v)} /></Field>
            <Field label="Hạn thanh toán NCC" hint={supplier ? `Để trống = ngày nhập + ${supplier.paymentTermDays} ngày` : undefined}>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
            </Field>
            <div className="rounded-lg bg-primary-light p-3 text-sm">
              <p className="text-text-secondary">Tổng phải trả</p>
              <p className="text-xl font-bold text-primary-strong">{formatVND(total)}</p>
            </div>
          </div>
          <Field label="Ghi chú"><Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu phiếu nhập</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
