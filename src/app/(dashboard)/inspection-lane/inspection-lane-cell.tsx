"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { INSPECTION_LANE_LABELS } from "@/types";

export default function InspectionLaneCell({
  userId,
  currentLane,
}: {
  userId: string;
  currentLane: "XANH" | "DO" | null;
}) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const update = async (v: string) => {
    const inspectionLane = v === "NONE" ? null : v;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionLane }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã cập nhật luồng kiểm tra");
      router.refresh();
    } finally { setSaving(false); }
  };

  return (
    <Select
      items={[
        { value: "NONE", label: "— Chưa cài đặt —" },
        { value: "XANH", label: INSPECTION_LANE_LABELS.XANH },
        { value: "DO", label: INSPECTION_LANE_LABELS.DO },
      ]}
      value={currentLane ?? "NONE"}
      onValueChange={(v) => update(v as string)}
    >
      <SelectTrigger className="w-40 h-8 text-xs" disabled={saving}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NONE">— Chưa cài đặt —</SelectItem>
        <SelectItem value="XANH">{INSPECTION_LANE_LABELS.XANH}</SelectItem>
        <SelectItem value="DO">{INSPECTION_LANE_LABELS.DO}</SelectItem>
      </SelectContent>
    </Select>
  );
}
