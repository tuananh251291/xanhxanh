"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { OrchidRetailPointStatus } from "@prisma/client";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Textarea, useOrchidAction } from "@/components/orchid/ui";
import { ORCHID_POINT_STATUS_LABELS, toDateInputValue } from "@/lib/orchid/labels";

export type PointFormItem = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  managerName: string | null;
  phone: string | null;
  startDate: string | null;
  status: OrchidRetailPointStatus;
  note: string | null;
  loginEmail: string | null;
};

export default function PointDialog({ item }: { item?: PointFormItem }) {
  const init = (p?: PointFormItem) => ({
    name: p?.name ?? "",
    address: p?.address ?? "",
    managerName: p?.managerName ?? "",
    phone: p?.phone ?? "",
    startDate: p?.startDate ? toDateInputValue(p.startDate) : "",
    status: p?.status ?? ("ACTIVE" as OrchidRetailPointStatus),
    note: p?.note ?? "",
    loginEmail: "",
    loginPassword: "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(init(item));
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hasLogin = !!item?.loginEmail;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nhập tên điểm bán");
    const ok = await run(item ? `/api/orchid/retail-points/${item.id}` : "/api/orchid/retail-points", { method: item ? "PATCH" : "POST", body: { ...form, loginEmail: hasLogin ? null : form.loginEmail } }, "Đã lưu điểm bán");
    if (ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setForm(init(item)); }}>
      <DialogTrigger render={item ? <Button variant="outline" size="sm" /> : <Button />}>
        {item ? <><Pencil className="w-4 h-4 mr-1" />Sửa điểm bán</> : <><Plus className="w-4 h-4 mr-1" />Thêm điểm bán</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? `Sửa ${item.code}` : "Thêm điểm bán lẻ"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Tên điểm bán"><Input value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Địa chỉ"><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Người phụ trách"><Input value={form.managerName} onChange={(e) => set("managerName", e.target.value)} /></Field>
            <Field label="Số điện thoại"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Ngày bắt đầu"><Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="Trạng thái">
              <NativeSelect value={form.status} onChange={(e) => set("status", e.target.value as OrchidRetailPointStatus)}>
                {(Object.keys(ORCHID_POINT_STATUS_LABELS) as OrchidRetailPointStatus[]).map((s) => <option key={s} value={s}>{ORCHID_POINT_STATUS_LABELS[s]}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <div className="rounded-lg border border-divider p-3 space-y-3">
            <p className="text-sm font-semibold text-primary-strong">Tài khoản đăng nhập của điểm bán</p>
            {hasLogin ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email đăng nhập"><Input value={item!.loginEmail!} disabled /></Field>
                <Field label="Đặt lại mật khẩu" hint="Để trống = giữ nguyên"><Input value={form.loginPassword} onChange={(e) => set("loginPassword", e.target.value)} /></Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email đăng nhập" hint="Để trống nếu chưa cấp"><Input value={form.loginEmail} onChange={(e) => set("loginEmail", e.target.value)} /></Field>
                <Field label="Mật khẩu"><Input value={form.loginPassword} onChange={(e) => set("loginPassword", e.target.value)} placeholder="Tối thiểu 6 ký tự" /></Field>
              </div>
            )}
          </div>
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
