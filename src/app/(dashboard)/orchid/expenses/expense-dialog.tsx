"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { OrchidExpenseGroup } from "@prisma/client";
import { Plus, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, Textarea, MoneyInput, useOrchidAction, todayInputValue } from "@/components/orchid/ui";
import { ORCHID_EXPENSE_GROUP_LABELS } from "@/lib/orchid/labels";

type Category = { id: string; group: OrchidExpenseGroup; name: string };
type Account = { id: string; name: string; type: "CASH" | "BANK_TRANSFER" };

export default function ExpenseDialog({ categories, accounts }: { categories: Category[]; accounts: Account[] }) {
  const blank = () => ({ expenseDate: todayInputValue(), categoryId: "", amount: null as number | null, recipient: "", method: "CASH" as "CASH" | "BANK_TRANSFER", accountId: "", content: "" });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const groups = Object.keys(ORCHID_EXPENSE_GROUP_LABELS) as OrchidExpenseGroup[];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.categoryId) return toast.error("Chọn loại chi");
    if (!form.amount) return toast.error("Nhập số tiền");
    const ok = await run("/api/orchid/expenses", { method: "POST", body: { ...form, accountId: form.accountId || null } }, "Đã ghi khoản chi");
    if (ok) {
      setOpen(false);
      setForm(blank());
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}><Plus className="w-4 h-4 mr-1" />Thêm khoản chi</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Khoản chi mới</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày"><Input type="date" value={form.expenseDate} onChange={(e) => set("expenseDate", e.target.value)} /></Field>
            <Field label="Số tiền (đ)"><MoneyInput value={form.amount} onChange={(v) => set("amount", v)} /></Field>
          </div>
          <Field label="Loại chi">
            <NativeSelect value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">— Chọn loại chi —</option>
              {groups.map((g) => (
                <optgroup key={g} label={ORCHID_EXPENSE_GROUP_LABELS[g]}>
                  {categories.filter((c) => c.group === g).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Người nhận"><Input value={form.recipient} onChange={(e) => set("recipient", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phương thức">
              <NativeSelect value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as "CASH" | "BANK_TRANSFER", accountId: "" }))}>
                <option value="CASH">Tiền mặt</option>
                <option value="BANK_TRANSFER">Chuyển khoản</option>
              </NativeSelect>
            </Field>
            <Field label="Nguồn chi">
              <NativeSelect value={form.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">— Chọn —</option>
                {accounts.filter((a) => a.type === form.method).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Nội dung"><Textarea rows={2} value={form.content} onChange={(e) => set("content", e.target.value)} /></Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
