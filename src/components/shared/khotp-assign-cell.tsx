"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";

const NONE = "NONE";

type StaffOption = { id: string; code: string; name: string };

// Ô "Giao cho" dùng chung cho 3 khu vực Quản lý kho thành phẩm gán việc (Nhận bàn giao thành phẩm/Nhập
// hàng/Sắp xếp đơn hàng) — NV kho thành phẩm thường vẫn thấy MỌI phiếu Nhận bàn giao/Nhập hàng như trước
// (không giới hạn), riêng đơn hàng ở /orders/pack đã lọc chỉ còn đơn được gán cho đúng mình (xem
// onlyMyAssigned ở page.tsx) nên ô này với NV thường lúc đó chỉ còn tác dụng hiển thị tham khảo. Ô này
// chỉ hiện dropdown chọn NV cho Quản lý (canAssign), người khác chỉ thấy badge "Đã giao: ..." tham khảo.
// endpoint nhận PATCH { action: "assign", assignedToId }, 3 route đều cùng hình dạng này.
export default function KhoTpAssignCell({
  endpoint,
  assignedTo,
  staffOptions,
  canAssign,
}: {
  endpoint: string;
  assignedTo: StaffOption | null;
  staffOptions: StaffOption[];
  canAssign: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const assign = async (staffId: string) => {
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", assignedToId: staffId === NONE ? null : staffId }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(staffId === NONE ? "Đã bỏ gán" : "Đã giao việc");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (!canAssign) {
    if (!assignedTo) return <span className="text-xs text-text-muted">—</span>;
    return (
      <Badge className="bg-info-light text-info-foreground whitespace-nowrap">
        <UserCheck className="w-3 h-3 mr-1" /> {assignedTo.name} ({assignedTo.code})
      </Badge>
    );
  }

  return (
    <Select value={assignedTo?.id ?? NONE} onValueChange={(v) => assign(v as string)} disabled={saving}>
      <SelectTrigger className="h-8 text-xs w-48">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SelectValue placeholder="Chưa giao" />}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>— Chưa giao —</SelectItem>
        {staffOptions.map((s) => (
          <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
