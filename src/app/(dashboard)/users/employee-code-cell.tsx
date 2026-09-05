"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Sửa nhanh riêng "Mã nhân viên" ngay trong bảng — tách khỏi dialog "Sửa tài khoản" đầy đủ (chỉ
// SUPER_ADMIN) để NV Hành chính nhân sự thao tác được qua đúng 1 ô, không cần quyền sửa tên/email/vai
// trò/mật khẩu (xem canEditEmployeeCode + PATCH /api/users/[id] nhánh { code } riêng).
export default function EmployeeCodeCell({
  userId,
  code,
  canEdit,
}: {
  userId: string;
  code: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(code);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  if (!canEdit) {
    return <span className="font-mono text-sm text-text-secondary">{code}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="group inline-flex items-center gap-1.5 font-mono text-sm text-text-secondary hover:text-primary-strong"
        onClick={() => { setValue(code); setEditing(true); }}
        title="Sửa mã nhân viên"
      >
        {code}
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) { toast.error("Mã nhân viên không được để trống"); return; }
    if (trimmed === code) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success("Đã cập nhật mã nhân viên");
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-28 text-xs font-mono"
        disabled={saving}
        autoFocus
      />
      <Button size="icon-sm" className="h-7 w-7 bg-primary hover:bg-primary-hover" disabled={saving} onClick={save} title="Lưu">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
      </Button>
      <Button size="icon-sm" variant="ghost" className="h-7 w-7" disabled={saving} onClick={() => setEditing(false)} title="Hủy">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
