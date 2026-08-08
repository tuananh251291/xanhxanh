"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import ContaminationEntriesDialog from "./contamination-entries-dialog";

type Lot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  enteredAt: string;
  plantType: { code: string; name: string };
  instruction: { code: string } | null;
};

// Cột "Số lượng" — bấm bút chì để sửa tại chỗ (Admin/Admin cấp cao, xem PATCH /api/lots/[id] — chỉ đổi
// quantity, giữ nguyên initialQuantity). Mirror EditLotQuantityRow ở /warehouses/shelf-table.tsx nhưng
// đơn giản hơn vì mỗi dòng ở trang này đã là 1 lô riêng (không cần gộp theo giàn kệ).
function QuantityCell({ lot, canEdit }: { lot: Lot; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(lot.quantity));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  if (!canEdit) return <>{lot.quantity.toLocaleString("vi-VN")}</>;

  if (!editing) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span>{lot.quantity.toLocaleString("vi-VN")}</span>
        <Button
          type="button" variant="ghost" size="icon-sm"
          className="text-text-muted hover:text-primary-strong hover:bg-primary-light"
          onClick={() => { setValue(String(lot.quantity)); setEditing(true); }}
          title="Sửa số lượng"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  const save = async () => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (trimmed === "" || !Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      toast.error("Số lượng phải là số nguyên không âm");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/lots/${lot.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: parsed }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật số lượng lô");
      setEditing(false);
      router.refresh();
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="number" min={0} className="h-8 w-24 text-right text-sm"
        value={value} disabled={saving} autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      />
      <Button type="button" size="icon-sm" className="bg-primary hover:bg-primary-hover" disabled={saving} onClick={save} title="Lưu">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled={saving} onClick={() => setEditing(false)} title="Hủy">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

export default function PhongToiLotsTable({ lots, isPhongNhiem, canEdit }: { lots: Lot[]; isPhongNhiem: boolean; canEdit: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-light">
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã lô sản phẩm</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Chỉ định cấy</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã cây</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tên cây</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Quy cách</th>
            <th className="text-right px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
            <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">{isPhongNhiem ? "Ngày phát sinh đầu tiên" : "Ngày nhập kho tối"}</th>
            {isPhongNhiem && <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Chi tiết</th>}
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr key={lot.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
              <td className="px-4 py-3 font-mono font-medium text-info-foreground">{lot.code}</td>
              <td className="px-4 py-3 font-mono text-text-secondary">{lot.instruction?.code ?? "—"}</td>
              <td className="px-4 py-3 font-mono text-text-secondary">{lot.plantType.code}</td>
              <td className="px-4 py-3 text-foreground">{lot.plantType.name}</td>
              <td className="px-4 py-3"><Badge variant="secondary">{lot.stageCode}</Badge></td>
              <td className="px-4 py-3 text-right font-medium">
                <QuantityCell lot={lot} canEdit={canEdit} />
              </td>
              <td className="px-4 py-3 text-text-secondary">{format(new Date(lot.enteredAt), "dd/MM/yyyy", { locale: vi })}</td>
              {isPhongNhiem && (
                <td className="px-4 py-3 text-center">
                  <ContaminationEntriesDialog lotId={lot.id} lotCode={lot.code} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
