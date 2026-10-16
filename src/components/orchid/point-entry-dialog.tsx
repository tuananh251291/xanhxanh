"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { OrchidDamageReason } from "@prisma/client";
import { Plus, Loader2, ImagePlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, MoneyInput, useOrchidAction, todayInputValue } from "@/components/orchid/ui";
import { ORCHID_DAMAGE_REASON_LABELS } from "@/lib/orchid/labels";
import { compressImageToDataUrl } from "@/lib/image-compress";

const TITLES = { sale: "Nhập bán hàng", damage: "Báo cây hỏng", stock: "Báo số cây còn" } as const;

// Nhập bán hàng / cây hỏng / số cây còn tại điểm bán. pointId có = NV nhập hộ (API quản trị); không có =
// tài khoản điểm bán tự nhập (API /api/orchid/point).
export default function PointEntryDialog({ kind, pointId, triggerLabel, expectedStock }: { kind: "sale" | "damage" | "stock"; pointId?: string; triggerLabel?: string; expectedStock?: number }) {
  const blank = () => ({ date: todayInputValue(), quantity: 1, revenue: null as number | null, invoiceNumber: "", reason: "VAN_CHUYEN" as OrchidDamageReason, photoUrls: [] as string[], remainingQuantity: expectedStock ?? 0, note: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [uploading, setUploading] = useState(false);
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await compressImageToDataUrl(file, { targetMaxBytes: 700 * 1024, hardLimitBytes: 2 * 1024 * 1024, dimensionSteps: [1600, 1280, 1024], stampTimestamp: true });
        const res = await fetch(pointId ? "/api/orchid/photos" : "/api/orchid/point/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.message ?? "Tải ảnh thất bại"); continue; }
        setForm((f) => ({ ...f, photoUrls: [...f.photoUrls, data.url] }));
      }
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body =
      kind === "sale"
        ? { kind, date: form.date, quantity: form.quantity, revenue: form.revenue ?? 0, invoiceNumber: form.invoiceNumber, note: form.note }
        : kind === "damage"
          ? { kind, date: form.date, quantity: form.quantity, reason: form.reason, photoUrls: form.photoUrls, note: form.note }
          : { kind, date: form.date, remainingQuantity: form.remainingQuantity, note: form.note };
    if (kind === "sale" && !form.revenue) return toast.error("Nhập doanh thu");
    const ok = await run(pointId ? "/api/orchid/retail-entries" : "/api/orchid/point/entries", { method: "POST", body: pointId ? { ...body, pointId } : body }, "Đã ghi nhận");
    if (ok) {
      setOpen(false);
      setForm(blank());
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(blank()); }}>
      <DialogTrigger render={<Button variant={pointId ? "outline" : "default"} size={pointId ? "sm" : "default"} />}>
        <Plus className="w-4 h-4 mr-1" />{triggerLabel ?? TITLES[kind]}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{TITLES[kind]}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Ngày"><Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
          {kind === "sale" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Số cây bán"><Input type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></Field>
                <Field label="Doanh thu (đ)"><MoneyInput value={form.revenue} onChange={(v) => set("revenue", v)} /></Field>
              </div>
              <Field label="Số hoá đơn"><Input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} /></Field>
            </>
          )}
          {kind === "damage" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Số cây hỏng"><Input type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></Field>
                <Field label="Lý do">
                  <NativeSelect value={form.reason} onChange={(e) => set("reason", e.target.value as OrchidDamageReason)}>
                    {(Object.keys(ORCHID_DAMAGE_REASON_LABELS) as OrchidDamageReason[]).map((r) => <option key={r} value={r}>{ORCHID_DAMAGE_REASON_LABELS[r]}</option>)}
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Hình ảnh">
                <div className="flex flex-wrap gap-2">
                  {form.photoUrls.map((url) => (
                    <div key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="w-16 h-16 rounded-lg object-cover border border-divider" />
                      <button type="button" className="absolute -top-1.5 -right-1.5 rounded-full bg-card border border-border p-0.5" onClick={() => set("photoUrls", form.photoUrls.filter((u) => u !== url))}><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  {form.photoUrls.length < 6 && (
                    <label className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-primary-light/50">
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5 text-text-secondary" />}
                      <input type="file" accept="image/*" capture="environment" multiple className="hidden" disabled={uploading} onChange={(e) => { onPick(e.target.files); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              </Field>
            </>
          )}
          {kind === "stock" && (
            <Field label="Số cây còn thực tế" hint={expectedStock != null ? `Theo sổ sách hiện còn ${expectedStock} cây` : undefined}>
              <Input type="number" min={0} value={form.remainingQuantity} onChange={(e) => set("remainingQuantity", Number(e.target.value))} />
            </Field>
          )}
          <Field label="Ghi chú"><Input value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending || uploading}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
