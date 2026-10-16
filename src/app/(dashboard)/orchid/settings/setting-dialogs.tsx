"use client";

import { useState } from "react";
import type { OrchidExpenseGroup } from "@prisma/client";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Field, NativeSelect, useOrchidAction } from "@/components/orchid/ui";
import { ORCHID_EXPENSE_GROUP_LABELS } from "@/lib/orchid/labels";

function Shell({ title, isEdit, addLabel, children, onSubmit, pending, open, setOpen }: {
  title: string; isEdit: boolean; addLabel: string; children: React.ReactNode; onSubmit: () => void; pending: boolean; open: boolean; setOpen: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button size="sm" />}>
        {isEdit ? <Pencil className="w-4 h-4" /> : <><Plus className="w-4 h-4 mr-1" />{addLabel}</>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-3">
          {children}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Account = { id: string; name: string; type: "CASH" | "BANK_TRANSFER"; bankName: string | null; accountNumber: string | null; accountHolder: string | null; note: string | null; isActive: boolean };

export function AccountDialog({ item }: { item?: Account }) {
  const init = () => ({ name: item?.name ?? "", type: item?.type ?? ("BANK_TRANSFER" as const), bankName: item?.bankName ?? "", accountNumber: item?.accountNumber ?? "", accountHolder: item?.accountHolder ?? "", note: item?.note ?? "", isActive: item?.isActive ?? true });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(init);
  const { run, pending } = useOrchidAction();
  const save = async () => {
    if (await run(item ? `/api/orchid/settings/${item.id}?kind=account` : "/api/orchid/settings?kind=account", { method: item ? "PATCH" : "POST", body: f }, "Đã lưu tài khoản")) setOpen(false);
  };
  return (
    <Shell title={item ? "Sửa tài khoản" : "Thêm tài khoản nhận / chi tiền"} isEdit={!!item} addLabel="Thêm tài khoản" onSubmit={save} pending={pending} open={open} setOpen={(o) => { setOpen(o); if (o) setF(init()); }}>
      <Field label="Tên gọi"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: VCB công ty, Quỹ tiền mặt cửa hàng" /></Field>
      <Field label="Loại">
        <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "CASH" | "BANK_TRANSFER" })}>
          <option value="BANK_TRANSFER">Tài khoản ngân hàng</option>
          <option value="CASH">Tiền mặt</option>
        </NativeSelect>
      </Field>
      {f.type === "BANK_TRANSFER" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ngân hàng"><Input value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
          <Field label="Số tài khoản"><Input value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} /></Field>
          <Field label="Chủ tài khoản" className="col-span-2"><Input value={f.accountHolder} onChange={(e) => setF({ ...f, accountHolder: e.target.value })} /></Field>
        </div>
      )}
      <Field label="Ghi chú"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <Label className="flex items-center gap-2 font-normal"><Checkbox checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: !!v })} />Đang sử dụng</Label>
    </Shell>
  );
}

type Warehouse = { id: string; code: string; name: string; address: string | null; isActive: boolean };

export function WarehouseDialog({ item }: { item?: Warehouse }) {
  const init = () => ({ code: item?.code ?? "", name: item?.name ?? "", address: item?.address ?? "", isActive: item?.isActive ?? true });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(init);
  const { run, pending } = useOrchidAction();
  const save = async () => {
    if (await run(item ? `/api/orchid/settings/${item.id}?kind=warehouse` : "/api/orchid/settings?kind=warehouse", { method: item ? "PATCH" : "POST", body: f }, "Đã lưu kho")) setOpen(false);
  };
  return (
    <Shell title={item ? "Sửa kho" : "Thêm kho"} isEdit={!!item} addLabel="Thêm kho" onSubmit={save} pending={pending} open={open} setOpen={(o) => { setOpen(o); if (o) setF(init()); }}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Mã kho"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="Tên kho" className="col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      </div>
      <Field label="Địa chỉ"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <Label className="flex items-center gap-2 font-normal"><Checkbox checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: !!v })} />Đang sử dụng</Label>
    </Shell>
  );
}

type Category = { id: string; group: OrchidExpenseGroup; name: string; sortOrder: number; isActive: boolean };

export function CategoryDialog({ item }: { item?: Category }) {
  const init = () => ({ group: item?.group ?? ("MUA_HANG" as OrchidExpenseGroup), name: item?.name ?? "", sortOrder: item?.sortOrder ?? 0, isActive: item?.isActive ?? true });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(init);
  const { run, pending } = useOrchidAction();
  const save = async () => {
    if (await run(item ? `/api/orchid/settings/${item.id}?kind=category` : "/api/orchid/settings?kind=category", { method: item ? "PATCH" : "POST", body: f }, "Đã lưu loại chi")) setOpen(false);
  };
  return (
    <Shell title={item ? "Sửa loại chi" : "Thêm loại chi"} isEdit={!!item} addLabel="Thêm loại chi" onSubmit={save} pending={pending} open={open} setOpen={(o) => { setOpen(o); if (o) setF(init()); }}>
      <Field label="Nhóm">
        <NativeSelect value={f.group} onChange={(e) => setF({ ...f, group: e.target.value as OrchidExpenseGroup })}>
          {(Object.keys(ORCHID_EXPENSE_GROUP_LABELS) as OrchidExpenseGroup[]).map((g) => <option key={g} value={g}>{ORCHID_EXPENSE_GROUP_LABELS[g]}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Tên loại chi"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Thứ tự hiển thị"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
      <Label className="flex items-center gap-2 font-normal"><Checkbox checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: !!v })} />Đang sử dụng</Label>
    </Shell>
  );
}
