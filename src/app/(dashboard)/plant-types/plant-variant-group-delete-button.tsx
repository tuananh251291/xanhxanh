"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function PlantVariantGroupDeleteButton({ id, name }: { id: string; name: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const onDelete = async () => {
    if (!window.confirm(`Xoá nhóm biến thể "${name}"? Các mã cây thuộc nhóm sẽ không còn thuộc nhóm nào, không bị xoá.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plant-variant-groups?id=${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xoá nhóm biến thể");
      router.refresh();
    } finally { setLoading(false); }
  };

  return (
    <Button variant="ghost" size="sm" className="text-destructive hover:bg-danger-light" disabled={loading} onClick={onDelete}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}
