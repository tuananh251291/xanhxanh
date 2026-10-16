"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Loader2, Trash2, ImagePlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect, Textarea, MoneyInput, useOrchidAction } from "@/components/orchid/ui";
import { compressImageToDataUrl } from "@/lib/image-compress";

type Tier = { minQuantity: number; price: number | null };
export type ProductFormItem = {
  id: string;
  code: string;
  name: string;
  imageUrls: string[];
  youtubeUrl: string | null;
  description: string | null;
  unit: string;
  supplierId: string | null;
  note: string | null;
  showToCustomer: boolean;
  showStock: boolean;
  isActive: boolean;
  priceTiers: { minQuantity: number; price: number }[];
};

export default function ProductDialog({ item, suppliers }: { item?: ProductFormItem; suppliers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => initial(item));
  const [uploading, setUploading] = useState(false);
  const { run, pending } = useOrchidAction();

  function initial(i?: ProductFormItem) {
    return {
      code: i?.code ?? "",
      name: i?.name ?? "",
      imageUrls: i?.imageUrls ?? [],
      youtubeUrl: i?.youtubeUrl ?? "",
      description: i?.description ?? "",
      unit: i?.unit ?? "cây",
      supplierId: i?.supplierId ?? "",
      note: i?.note ?? "",
      showToCustomer: i?.showToCustomer ?? true,
      showStock: i?.showStock ?? true,
      isActive: i?.isActive ?? true,
      priceTiers: (i?.priceTiers.length ? i.priceTiers : [{ minQuantity: 1, price: 0 }]) as Tier[],
    };
  }
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onPickImages(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await compressImageToDataUrl(file, { targetMaxBytes: 800 * 1024, hardLimitBytes: 2 * 1024 * 1024, dimensionSteps: [1600, 1280, 1024] });
        const res = await fetch("/api/orchid/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl }) });
        const data = await res.json();
        if (!res.ok) { toast.error(data.message ?? "Tải ảnh thất bại"); continue; }
        setForm((f) => ({ ...f, imageUrls: [...f.imageUrls, data.url] }));
      }
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nhập tên sản phẩm");
    const tiers = form.priceTiers.filter((t) => t.minQuantity > 0).map((t) => ({ minQuantity: t.minQuantity, price: t.price ?? 0 }));
    const ok = await run(
      item ? `/api/orchid/products/${item.id}` : "/api/orchid/products",
      { method: item ? "PATCH" : "POST", body: { ...form, supplierId: form.supplierId || null, priceTiers: tiers } },
      item ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm"
    );
    if (ok) {
      setOpen(false);
      if (!item) setForm(initial());
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(initial(item)); }}>
      <DialogTrigger render={item ? <Button variant="ghost" size="sm" /> : <Button />}>
        {item ? <><Pencil className="w-4 h-4 mr-1" />Sửa</> : <><Plus className="w-4 h-4 mr-1" />Thêm sản phẩm</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? `Sửa sản phẩm ${item.code}` : "Thêm sản phẩm hoa lan"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Mã sản phẩm" hint={item ? undefined : "Để trống = tự sinh (SP001…)"}>
              <Input value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="SP001" />
            </Field>
            <Field label="Tên sản phẩm" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="VD: Lan Hồ Điệp trắng 3 cành" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Nhà cung cấp" className="sm:col-span-2">
              <NativeSelect value={form.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
                <option value="">— Không chọn —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Đơn vị tính">
              <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} />
            </Field>
          </div>

          <Field label="Hình ảnh">
            <div className="flex flex-wrap gap-2">
              {form.imageUrls.map((url) => (
                <div key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-divider" />
                  <button type="button" className="absolute -top-1.5 -right-1.5 rounded-full bg-card border border-border p-0.5" onClick={() => set("imageUrls", form.imageUrls.filter((u) => u !== url))}>
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-xs text-text-secondary cursor-pointer hover:bg-primary-light/50">
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImagePlus className="w-5 h-5" />}
                <span>Thêm ảnh</span>
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => { onPickImages(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
          </Field>

          <Field label="Link video YouTube">
            <Input value={form.youtubeUrl} onChange={(e) => set("youtubeUrl", e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
          </Field>
          <Field label="Mô tả (khách xem được)">
            <Textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </Field>

          <Field label="Giá bán theo mốc số lượng" hint="Áp dụng mốc lớn nhất mà số lượng đặt đạt tới. Giá riêng từng khách cài ở trang Khách hàng.">
            <div className="space-y-2">
              {form.priceTiers.map((t, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm text-text-secondary shrink-0">Từ</span>
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={t.minQuantity}
                    onChange={(e) => set("priceTiers", form.priceTiers.map((x, i) => (i === idx ? { ...x, minQuantity: Number(e.target.value) } : x)))}
                  />
                  <span className="text-sm text-text-secondary shrink-0">{form.unit} trở lên:</span>
                  <MoneyInput value={t.price} onChange={(v) => set("priceTiers", form.priceTiers.map((x, i) => (i === idx ? { ...x, price: v } : x)))} className="w-40" />
                  <span className="text-sm text-text-secondary">đ</span>
                  {form.priceTiers.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => set("priceTiers", form.priceTiers.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set("priceTiers", [...form.priceTiers, { minQuantity: (form.priceTiers.at(-1)?.minQuantity ?? 0) * 2 || 10, price: null }])}
              >
                <Plus className="w-4 h-4 mr-1" />Thêm mốc giá
              </Button>
            </div>
          </Field>

          <Field label="Ghi chú nội bộ">
            <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} />
          </Field>

          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={form.showToCustomer} onCheckedChange={(v) => set("showToCustomer", !!v)} />Hiển thị cho khách hàng
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox checked={form.showStock} onCheckedChange={(v) => set("showStock", !!v)} />Cho khách xem số tồn
            </Label>
            {item && (
              <Label className="flex items-center gap-2 font-normal">
                <Checkbox checked={form.isActive} onCheckedChange={(v) => set("isActive", !!v)} />Đang kinh doanh
              </Label>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending || uploading}>
              {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {item ? "Cập nhật" : "Thêm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
