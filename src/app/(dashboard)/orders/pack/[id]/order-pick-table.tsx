"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type PickItem = {
  id: string;
  plantCode: string;
  plantName: string;
  stageCode: string;
  quantity: number;
  pickedQuantity1: number;
  pickedQuantity2: number;
  pickedQuantity3: number;
  pickNotes: string | null;
};

type PickField = "pickedQuantity1" | "pickedQuantity2" | "pickedQuantity3";
const PICK_FIELDS: PickField[] = ["pickedQuantity1", "pickedQuantity2", "pickedQuantity3"];

// Giá trị đang gõ trên form của 1 dòng — số lượng giữ dạng chuỗi để cho phép ô trống khi đang gõ.
type RowDraft = Record<PickField, string> & { pickNotes: string };

// Lần nhặt chưa có số (0) để ô TRỐNG thay vì hiện "0" — NV chỉ cần gõ số, không phải xoá số 0 trước.
const qtyDraft = (n: number) => (n === 0 ? "" : String(n));

function toDraft(item: PickItem): RowDraft {
  return {
    pickedQuantity1: qtyDraft(item.pickedQuantity1),
    pickedQuantity2: qtyDraft(item.pickedQuantity2),
    pickedQuantity3: qtyDraft(item.pickedQuantity3),
    pickNotes: item.pickNotes ?? "",
  };
}

// "" = 0; trả null nếu không phải số nguyên không âm.
function parseQty(value: string): number | null {
  const trimmed = value.trim();
  const n = trimmed === "" ? 0 : Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Các trường đã đổi so với giá trị đã lưu của dòng — rỗng nghĩa là dòng không có gì cần lưu.
function changedFields(item: PickItem, draft: RowDraft): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of PICK_FIELDS) {
    const n = parseQty(draft[f]);
    if (n !== item[f]) data[f] = n;
  }
  const notes = draft.pickNotes.trim() === "" ? null : draft.pickNotes;
  if (notes !== item.pickNotes) data.pickNotes = notes;
  return data;
}

const qtyInputClass =
  "h-8 w-20 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

// Bảng "Nhặt hàng" trong chi tiết 1 đơn (/orders/pack/[id]) — mỗi dòng là 1 OrderItem (đúng 1 lô nguồn).
// NV điền số lượng nhặt 3 lần + ghi chú rồi bấm "Lưu" một lần cho cả bảng (chỉ gửi những dòng có đổi).
// "Số lượng còn thiếu" tính live ngay khi gõ (quantity - tổng 3 lần nhặt đang có trên form, không đợi
// lưu) — âm nghĩa là đã nhặt DƯ so với số cần, không chặn nhập vì có thể NV nhặt dư có chủ đích.
export default function OrderPickTable({ items, canEdit }: { items: PickItem[]; canEdit: boolean }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(items.map((i) => [i.id, toDraft(i)]))
  );
  const [saving, setSaving] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Đơn hàng không có dòng nào</p>;
  }

  const setField = (itemId: string, field: keyof RowDraft, value: string) =>
    setDrafts((d) => ({ ...d, [itemId]: { ...d[itemId], [field]: value } }));

  const invalid = items.some((i) => PICK_FIELDS.some((f) => parseQty(drafts[i.id][f]) === null));
  const changes = items
    .map((i) => ({ id: i.id, data: changedFields(i, drafts[i.id]) }))
    .filter((c) => Object.keys(c.data).length > 0);

  const save = async () => {
    if (invalid) { toast.error("Số lượng phải là số nguyên không âm"); return; }
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const results = await Promise.allSettled(
        changes.map(async (c) => {
          const res = await fetch(`/api/order-items/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(c.data),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message ?? "Có lỗi xảy ra");
        })
      );
      const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failed) toast.error(failed.reason instanceof Error ? failed.reason.message : "Có lỗi xảy ra");
      else toast.success("Đã lưu số lượng nhặt");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary-light text-left text-primary-strong">
              <th className="px-3 py-2 font-bold text-base">Tên</th>
              <th className="px-3 py-2 font-bold text-base">Mã cây</th>
              <th className="px-3 py-2 font-bold text-base">Quy cách cần</th>
              <th className="px-3 py-2 font-bold text-base text-right">Số lượng</th>
              <th className="px-3 py-2 font-bold text-base">SL nhặt lần 1</th>
              <th className="px-3 py-2 font-bold text-base">SL nhặt lần 2</th>
              <th className="px-3 py-2 font-bold text-base">SL nhặt lần 3</th>
              <th className="px-3 py-2 font-bold text-base text-right">Còn thiếu</th>
              <th className="px-3 py-2 font-bold text-base">Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const draft = drafts[item.id];
              const picked = PICK_FIELDS.reduce((s, f) => s + (parseQty(draft[f]) ?? 0), 0);
              const remaining = item.quantity - picked;
              return (
                <tr key={item.id} className="border-b last:border-0 even:bg-primary-light/30">
                  <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.plantName}</td>
                  <td className="px-3 py-2 text-sm font-mono text-text-secondary whitespace-nowrap">{item.plantCode}</td>
                  <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.stageCode}</td>
                  <td className="px-3 py-2 text-sm text-right font-medium tabular-nums whitespace-nowrap">{item.quantity.toLocaleString("vi-VN")}</td>
                  {PICK_FIELDS.map((f) => (
                    <td key={f} className="px-3 py-2">
                      <Input
                        type="number"
                        min={0}
                        className={qtyInputClass}
                        value={draft[f]}
                        disabled={!canEdit || saving}
                        aria-invalid={parseQty(draft[f]) === null || undefined}
                        onChange={(e) => setField(item.id, f, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                      />
                    </td>
                  ))}
                  <td className={`px-3 py-2 text-sm text-right font-semibold tabular-nums whitespace-nowrap ${remaining > 0 ? "text-destructive" : remaining < 0 ? "text-warning-foreground" : "text-success-foreground"}`}>
                    {remaining.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      className="h-8 text-xs min-w-40"
                      value={draft.pickNotes}
                      disabled={!canEdit || saving}
                      onChange={(e) => setField(item.id, "pickNotes", e.target.value)}
                      placeholder="Ghi chú..."
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {changes.length > 0 && (
            <span className="text-xs text-warning-foreground">Có thay đổi chưa lưu</span>
          )}
          <Button size="sm" className="h-8" disabled={saving || invalid || changes.length === 0} onClick={save}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            Lưu
          </Button>
        </div>
      )}
    </div>
  );
}
