"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Textarea, useOrchidAction, todayInputValue } from "@/components/orchid/ui";

type Line = { productId: string; quantity: number };

// TO_POINT: Kho trung tâm → Điểm bán (trừ lô FIFO). FROM_POINT: Điểm bán → Kho trung tâm (tạo lô mới).
export default function TransferDialog({
  type,
  points,
  products,
  warehouses,
  defaultPointId,
}: {
  type: "TO_POINT" | "FROM_POINT";
  points: { id: string; code: string; name: string }[];
  products: { id: string; code: string; name: string; available: number }[];
  warehouses: { id: string; name: string }[];
  defaultPointId?: string;
}) {
  const blank = () => ({
    pointId: defaultPointId ?? "",
    warehouseId: warehouses[0]?.id ?? "",
    transferDate: todayInputValue(),
    deliveredBy: "",
    receivedBy: "",
    note: "",
    items: [{ productId: "", quantity: 1 }] as Line[],
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (idx: number, patch: Partial<Line>) => set("items", form.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const total = form.items.reduce((s, l) => s + l.quantity, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pointId) return toast.error("Chọn điểm bán");
    if (form.items.some((l) => !l.productId || l.quantity < 1)) return toast.error("Chọn sản phẩm và số lượng");
    const ok = await run("/api/orchid/transfers", { method: "POST", body: { ...form, type, warehouseId: type === "FROM_POINT" ? form.warehouseId : null } }, "Đã tạo phiếu điều chuyển");
    if (ok) {
      setOpen(false);
      setForm(blank());
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(blank()); }}>
      <DialogTrigger render={<Button variant={type === "TO_POINT" ? "default" : "outline"} />}>
        <Plus className="w-4 h-4 mr-1" />{type === "TO_POINT" ? "Gửi hàng cho điểm bán" : "Nhận hàng trả về kho"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{type === "TO_POINT" ? "Kho trung tâm → Điểm bán" : "Điểm bán → Kho trung tâm"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Điểm bán">
              <NativeSelect value={form.pointId} onChange={(e) => set("pointId", e.target.value)}>
                <option value="">— Chọn —</option>
                {points.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Ngày"><Input type="date" value={form.transferDate} onChange={(e) => set("transferDate", e.target.value)} /></Field>
            {type === "FROM_POINT" && (
              <Field label="Nhập về kho" className="col-span-2">
                <NativeSelect value={form.warehouseId} onChange={(e) => set("warehouseId", e.target.value)}>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </NativeSelect>
              </Field>
            )}
            <Field label="Người giao"><Input value={form.deliveredBy} onChange={(e) => set("deliveredBy", e.target.value)} /></Field>
            <Field label="Người nhận"><Input value={form.receivedBy} onChange={(e) => set("receivedBy", e.target.value)} /></Field>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Hàng {type === "TO_POINT" ? "gửi" : "trả về"} <span className="text-text-muted font-normal">(điểm bán chỉ thấy tổng số cây)</span></p>
            {form.items.map((l, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <NativeSelect className="flex-1" value={l.productId} onChange={(e) => setLine(idx, { productId: e.target.value })}>
                  <option value="">— Chọn sản phẩm —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}{type === "TO_POINT" ? ` (khả dụng ${p.available})` : ""}</option>)}
                </NativeSelect>
                <Input type="number" min={1} className="w-24" value={l.quantity} onChange={(e) => setLine(idx, { quantity: Number(e.target.value) })} />
                {form.items.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => set("items", form.items.filter((_, i) => i !== idx))}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => set("items", [...form.items, { productId: "", quantity: 1 }])}><Plus className="w-4 h-4 mr-1" />Thêm dòng</Button>
              <span className="text-sm font-semibold">Tổng: {total} cây</span>
            </div>
          </div>
          <Field label="Ghi chú"><Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Tạo phiếu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
