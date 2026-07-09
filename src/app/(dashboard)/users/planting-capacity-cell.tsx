"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function PlantingCapacityCell({
  userId,
  currentValue,
}: {
  userId: string;
  currentValue: number;
}) {
  const [value, setValue] = useState(String(currentValue));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const save = async () => {
    const plantingCapacity = parseInt(value, 10);
    if (!Number.isFinite(plantingCapacity) || plantingCapacity <= 0) {
      toast.error("Năng lực cấy phải là số nguyên dương");
      setValue(String(currentValue));
      return;
    }
    if (plantingCapacity === currentValue) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantingCapacity }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        setValue(String(currentValue));
        return;
      }
      toast.success("Đã cập nhật năng lực cấy");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      type="number"
      min={1}
      className="w-24 h-8 text-xs"
      value={value}
      disabled={saving}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}
