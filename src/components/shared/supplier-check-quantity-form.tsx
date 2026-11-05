"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type SupplierCheckQuantityLine = { id: string; label: string; quantity: number };

// Nhập số lượng từng loại cây của 1 Đơn kiểm tra — NCC tự xác nhận/nhập phiếu giao ở cổng NCC, QL Kho TP nhập hộ NCC chưa
// có tài khoản ở trang Kiểm tra NCC.
export default function SupplierCheckQuantityForm({
  endpoint,
  action,
  lines,
  columnLabel,
  submitLabel,
}: {
  endpoint: string;
  action: "respond" | "deliver";
  lines: SupplierCheckQuantityLine[];
  columnLabel: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const items = lines.map((l) => ({ id: l.id, quantity: Number(values[l.id]) }));
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 0)) { toast.error("Số lượng phải là số nguyên không âm"); return; }
    setSaving(true);
    try {
      const res = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, items }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã ghi nhận");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left py-1 pr-3 text-base text-primary-strong font-bold">Cây · quy cách</th>
            <th className="text-right py-1 pr-3 text-base text-primary-strong font-bold">Yêu cầu</th>
            <th className="text-right py-1 text-base text-primary-strong font-bold">{columnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-t border-divider">
              <td className="py-1 pr-3">{l.label}</td>
              <td className="py-1 pr-3 text-right">{l.quantity.toLocaleString("vi-VN")}</td>
              <td className="py-1 text-right">
                <Input
                  type="number"
                  min={0}
                  aria-label={`${columnLabel} ${l.label}`}
                  value={values[l.id] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  className="w-28 ml-auto text-right"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end">
        <Button type="button" size="sm" disabled={saving} onClick={submit}>
          {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} {submitLabel}
        </Button>
      </div>
    </div>
  );
}
