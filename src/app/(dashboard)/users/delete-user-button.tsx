"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Cùng khuôn với suppliers/delete-supplier-button.tsx — xóa cứng, chỉ cho phép khi tài khoản CHƯA có
// dữ liệu liên quan (server tự kiểm tra qua _count, xem DELETE /api/users/[id]). Tài khoản đã có lịch
// sử thì server trả lỗi rõ ràng, gợi ý dùng "Ngừng hoạt động" thay vì xóa.
export default function DeleteUserButton({ id, code, name }: { id: string; code: string; name: string }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const onDelete = async () => {
    if (!window.confirm(`Xóa hoàn toàn tài khoản "${code} — ${name}" khỏi hệ thống? Không thể hoàn tác.`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success(`Đã xóa tài khoản ${code}`);
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
      title="Xóa tài khoản"
    >
      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      <span className="sr-only">Xóa tài khoản</span>
    </Button>
  );
}
