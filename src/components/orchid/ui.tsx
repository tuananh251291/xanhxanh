"use client";

import { forwardRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

// Bộ khung UI dùng chung cho Dự án hoa lan (admin + khách + điểm bán) — theo design system pastel của repo.

export const TH = "text-left px-3 py-2.5 text-base text-primary-strong font-bold whitespace-nowrap";
export const THR = "text-right px-3 py-2.5 text-base text-primary-strong font-bold whitespace-nowrap";
export const TD = "px-3 py-2.5 text-sm text-foreground";
export const TDR = "px-3 py-2.5 text-sm text-foreground text-right tabular-nums";
export const TR = "border-b border-divider last:border-0 hover:bg-primary-light/40";

const controlClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

export const NativeSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function NativeSelect(
  { className, ...props },
  ref
) {
  return <select ref={ref} className={cn(controlClass, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return <textarea ref={ref} className={cn(controlClass, "h-auto min-h-20 py-2", className)} {...props} />;
});

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-text-muted">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Gọi API JSON + toast + refresh trang server. Trả về true nếu thành công.
export function useOrchidAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run(url: string, init: { method: string; body?: unknown }, successMessage?: string): Promise<boolean> {
    setPending(true);
    try {
      const res = await fetch(url, {
        method: init.method,
        headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message ?? "Có lỗi xảy ra");
        return false;
      }
      if (successMessage) toast.success(successMessage);
      router.refresh();
      return true;
    } catch {
      toast.error("Không kết nối được máy chủ");
      return false;
    } finally {
      setPending(false);
    }
  }
  return { run, pending };
}

export function todayInputValue(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Ô nhập tiền — hiển thị có dấu chấm phân cách nghìn, giá trị trả ra là số.
export function MoneyInput({ value, onChange, placeholder, className, disabled }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <input
      inputMode="numeric"
      className={cn(controlClass, "text-right tabular-nums", className)}
      value={value == null ? "" : value.toLocaleString("vi-VN")}
      placeholder={placeholder ?? "0"}
      disabled={disabled}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        onChange(digits === "" ? null : Number(digits));
      }}
    />
  );
}
