"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import ShipAtInput from "@/components/shared/ship-at-input";

// Quản lý kho thành phẩm sửa "Thời gian dự kiến xuất" (ngày + giờ) ngay trên danh sách đơn — xem PATCH
// /api/orders/[id] action=reschedule.
export default function ShipAtEditCell({ orderId, expectedShipAt }: { orderId: string; expectedShipAt: string | null }) {
  const router = useRouter();
  const initial = expectedShipAt ? format(new Date(expectedShipAt), "yyyy-MM-dd'T'HH:mm") : "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!value) { toast.error("Chọn ngày xuất"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule", expectedShipAt: new Date(value).toISOString() }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật thời gian dự kiến xuất");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span>{expectedShipAt ? format(new Date(expectedShipAt), "HH:mm dd/MM/yyyy") : "—"}</span>
        <Button size="icon-sm" variant="ghost" title="Sửa thời gian dự kiến xuất" onClick={() => { setValue(initial); setEditing(true); }}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 min-w-[18rem]">
      <ShipAtInput value={value} onChange={setValue} canEditTime />
      <Button size="icon-sm" className="bg-primary hover:bg-primary-hover" disabled={saving} onClick={save} title="Lưu">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </Button>
      <Button size="icon-sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)} title="Hủy">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
