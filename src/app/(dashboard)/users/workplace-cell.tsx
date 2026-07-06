"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type WarehouseOption = { id: string; code: string; name: string };

export default function WorkplaceCell({
  userId,
  currentWarehouseId,
  warehouseOptions,
}: {
  userId: string;
  currentWarehouseId: string | null;
  warehouseOptions: WarehouseOption[];
}) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const update = async (v: string) => {
    const workplaceWarehouseId = v === "NONE" ? null : v;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workplaceWarehouseId }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật địa điểm làm việc");
      router.refresh();
    } finally { setSaving(false); }
  };

  return (
    <Select
      items={[{ value: "NONE", label: "— Chưa gán —" }, ...warehouseOptions.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))]}
      value={currentWarehouseId ?? "NONE"}
      onValueChange={(v) => update(v as string)}
    >
      <SelectTrigger className="w-52 h-8 text-xs" disabled={saving}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NONE">— Chưa gán —</SelectItem>
        {warehouseOptions.map((w) => (
          <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
