"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Banknote, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, NativeSelect, MoneyInput, useOrchidAction, todayInputValue } from "@/components/orchid/ui";
import { formatVND } from "@/lib/orchid/labels";

type Account = { id: string; name: string; type: "CASH" | "BANK_TRANSFER"; bankName: string | null; accountNumber: string | null };

const TITLES = { customer: "Ghi nhận khách thanh toán", supplier: "Ghi nhận trả tiền NCC", point: "Ghi nhận điểm bán nộp tiền" } as const;
const DOC_LABEL = { customer: "Thanh toán cho đơn", supplier: "Trả cho phiếu nhập", point: "" } as const;

// Ghi nhận thanh toán (tiền mặt / chuyển khoản, chọn tài khoản nhận/chi).
export default function PaymentDialog({
  kind,
  targetId,
  targetName,
  accounts,
  docs = [],
  defaultAmount,
  triggerLabel = "Ghi nhận thanh toán",
  size = "default",
}: {
  kind: "customer" | "supplier" | "point";
  targetId: string;
  targetName: string;
  accounts: Account[];
  docs?: { id: string; label: string; unpaid?: number }[];
  defaultAmount?: number;
  triggerLabel?: string;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ paymentDate: todayInputValue(), amount: defaultAmount ?? null as number | null, method: "BANK_TRANSFER" as "CASH" | "BANK_TRANSFER", accountId: "", docId: "", note: "" });
  const { run, pending } = useOrchidAction();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const accountChoices = accounts.filter((a) => a.type === form.method);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) return toast.error("Nhập số tiền");
    const ok = await run("/api/orchid/payments", { method: "POST", body: { kind, targetId, ...form, accountId: form.accountId || null, docId: form.docId || null } }, "Đã ghi nhận thanh toán");
    if (ok) {
      setOpen(false);
      setForm((f) => ({ ...f, amount: null, note: "", docId: "" }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} variant={size === "sm" ? "outline" : "default"} />}>
        <Banknote className="w-4 h-4 mr-1" />{triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{TITLES[kind]}</DialogTitle></DialogHeader>
        <p className="text-sm text-text-secondary -mt-2">{targetName}</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ngày"><Input type="date" value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} /></Field>
            <Field label="Số tiền (đ)"><MoneyInput value={form.amount} onChange={(v) => set("amount", v)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hình thức">
              <NativeSelect value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as "CASH" | "BANK_TRANSFER", accountId: "" }))}>
                <option value="BANK_TRANSFER">Chuyển khoản</option>
                <option value="CASH">Tiền mặt</option>
              </NativeSelect>
            </Field>
            <Field label={kind === "supplier" ? "Nguồn chi" : "Tài khoản nhận"}>
              <NativeSelect value={form.accountId} onChange={(e) => set("accountId", e.target.value)}>
                <option value="">— Chọn —</option>
                {accountChoices.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.accountNumber ? ` · ${a.bankName ?? ""} ${a.accountNumber}` : ""}</option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {docs.length > 0 && kind !== "point" && (
            <Field label={DOC_LABEL[kind]} hint="Không chọn = trừ dần vào chứng từ cũ nhất">
              <NativeSelect value={form.docId} onChange={(e) => {
                const doc = docs.find((d) => d.id === e.target.value);
                setForm((f) => ({ ...f, docId: e.target.value, amount: doc?.unpaid && !f.amount ? Math.round(doc.unpaid) : f.amount }));
              }}>
                <option value="">— Không chọn —</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.label}{d.unpaid != null ? ` · còn ${formatVND(d.unpaid)}` : ""}</option>)}
              </NativeSelect>
            </Field>
          )}
          <Field label="Ghi chú"><Input value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" className="flex-1" disabled={pending}>{pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Lưu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
