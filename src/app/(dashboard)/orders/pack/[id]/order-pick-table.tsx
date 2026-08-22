"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
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

async function savePickItem(itemId: string, data: Record<string, unknown>) {
  const res = await fetch(`/api/order-items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Có lỗi xảy ra");
  return json;
}

// 1 ô số lượng nhặt (lần 1/2/3) — tự quản lý state riêng, lưu khi rời khỏi ô (blur) hoặc bấm Enter, đủ
// điều kiện để "Số lượng còn thiếu" ở PickRow tính lại NGAY từ giá trị đang gõ (không đợi lưu xong).
function PickedQuantityCell({
  itemId, field, initialValue, disabled, onLocalChange,
}: {
  itemId: string;
  field: "pickedQuantity1" | "pickedQuantity2" | "pickedQuantity3";
  initialValue: number;
  disabled: boolean;
  onLocalChange: (value: number) => void;
}) {
  const [value, setValue] = useState(String(initialValue));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      toast.error("Số lượng phải là số nguyên không âm");
      setValue(String(initialValue));
      onLocalChange(initialValue);
      return;
    }
    setValue(String(parsed));
    onLocalChange(parsed);
    if (parsed === initialValue) return;
    setSaving(true);
    try {
      await savePickItem(itemId, { [field]: parsed });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setValue(String(initialValue));
      onLocalChange(initialValue);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      type="number"
      min={0}
      className="h-8 w-20 text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      value={value}
      disabled={disabled || saving}
      onChange={(e) => {
        setValue(e.target.value);
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onLocalChange(n);
      }}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

function NotesCell({ itemId, initialValue, disabled }: { itemId: string; initialValue: string | null; disabled: boolean }) {
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (value === (initialValue ?? "")) return;
    setSaving(true);
    try {
      await savePickItem(itemId, { pickNotes: value.trim() === "" ? null : value });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Có lỗi xảy ra");
      setValue(initialValue ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      className="h-8 text-xs min-w-40"
      value={value}
      disabled={disabled || saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      placeholder="Ghi chú..."
    />
  );
}

function PickRow({ item, canEdit }: { item: PickItem; canEdit: boolean }) {
  const [picked, setPicked] = useState({
    p1: item.pickedQuantity1,
    p2: item.pickedQuantity2,
    p3: item.pickedQuantity3,
  });
  const remaining = item.quantity - (picked.p1 + picked.p2 + picked.p3);

  return (
    <tr className="border-b last:border-0 even:bg-primary-light/30">
      <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.plantName}</td>
      <td className="px-3 py-2 text-sm font-mono text-text-secondary whitespace-nowrap">{item.plantCode}</td>
      <td className="px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.stageCode}</td>
      <td className="px-3 py-2 text-sm text-right font-medium tabular-nums whitespace-nowrap">{item.quantity.toLocaleString("vi-VN")}</td>
      <td className="px-3 py-2">
        <PickedQuantityCell
          itemId={item.id}
          field="pickedQuantity1"
          initialValue={item.pickedQuantity1}
          disabled={!canEdit}
          onLocalChange={(v) => setPicked((p) => ({ ...p, p1: v }))}
        />
      </td>
      <td className="px-3 py-2">
        <PickedQuantityCell
          itemId={item.id}
          field="pickedQuantity2"
          initialValue={item.pickedQuantity2}
          disabled={!canEdit}
          onLocalChange={(v) => setPicked((p) => ({ ...p, p2: v }))}
        />
      </td>
      <td className="px-3 py-2">
        <PickedQuantityCell
          itemId={item.id}
          field="pickedQuantity3"
          initialValue={item.pickedQuantity3}
          disabled={!canEdit}
          onLocalChange={(v) => setPicked((p) => ({ ...p, p3: v }))}
        />
      </td>
      <td className={`px-3 py-2 text-sm text-right font-semibold tabular-nums whitespace-nowrap ${remaining > 0 ? "text-destructive" : remaining < 0 ? "text-warning-foreground" : "text-success-foreground"}`}>
        {remaining.toLocaleString("vi-VN")}
      </td>
      <td className="px-3 py-2">
        <NotesCell itemId={item.id} initialValue={item.pickNotes} disabled={!canEdit} />
      </td>
    </tr>
  );
}

// Bảng "Nhặt hàng" trong chi tiết 1 đơn (/orders/pack/[id]) — mỗi dòng là 1 OrderItem (đúng 1 lô nguồn).
// "Số lượng còn thiếu" tính live ngay khi gõ (quantity - tổng 3 lần nhặt đang có trên form, không đợi
// lưu xong) — âm nghĩa là đã nhặt DƯ so với số cần, không chặn nhập vì có thể NV nhặt dư có chủ đích.
export default function OrderPickTable({ items, canEdit }: { items: PickItem[]; canEdit: boolean }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-muted">Đơn hàng không có dòng nào</p>;
  }
  return (
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
          {items.map((item) => (
            <PickRow key={item.id} item={item} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
