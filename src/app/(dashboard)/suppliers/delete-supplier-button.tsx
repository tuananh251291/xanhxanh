"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DeleteSupplierButton({ id, code, name }: { id: string; code: string; name: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const onDelete = async () => {
    if (!window.confirm(`Xóa hoàn toàn nhà cung cấp "${code} — ${name}" khỏi hệ thống? Không thể hoàn tác.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã xóa nhà cung cấp ${code}`);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-destructive hover:bg-danger-light"
      disabled={deleting}
      onClick={onDelete}
      title="Xóa nhà cung cấp"
    >
      {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </Button>
  );
}
