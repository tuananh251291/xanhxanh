"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Sửa nhanh riêng 1 field text ("code"/"name") ngay trong bảng — tách khỏi dialog "Sửa tài khoản" đầy đủ
// (chỉ SUPER_ADMIN) để NV Hành chính nhân sự thao tác được qua đúng 1 ô, không cần quyền sửa các field
// khác (email/vai trò/mật khẩu). Dùng chung cho cả "Mã nhân viên" (canEditEmployeeCode) và "Tên"
// (canEditEmployeeName) — xem PATCH /api/users/[id] 2 nhánh { code } / { name } riêng tương ứng.
export default function UserInlineFieldCell({
  userId,
  field,
  value,
  canEdit,
  textClassName = "text-sm text-text-secondary",
  monospace,
  emptyErrorMessage,
  successMessage,
  editTitle,
}: {
  userId: string;
  field: "code" | "name";
  value: string;
  canEdit: boolean;
  // Style của chữ khi KHÔNG sửa (và của nút bấm khi có quyền sửa) — mỗi field 1 kiểu khác nhau trong
  // bảng gốc (VD "Mã NV" chữ nhỏ/mờ, "Tên" chữ đậm/đen), truyền riêng để giữ nguyên giao diện cũ.
  textClassName?: string;
  monospace?: boolean;
  emptyErrorMessage: string;
  successMessage: string;
  editTitle: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const textClass = `${textClassName} ${monospace ? "font-mono" : ""}`;

  if (!canEdit) {
    return <span className={textClass}>{value}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        className={`group inline-flex items-center gap-1.5 hover:text-primary-strong ${textClass}`}
        onClick={() => { setDraft(value); setEditing(true); }}
        title={editTitle}
      >
        {value}
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100" />
      </button>
    );
  }

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed) { toast.error(emptyErrorMessage); return; }
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: trimmed }),
      });
      if (!res.ok) {
        toast.error((await res.json()).message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(successMessage);
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className={`h-7 w-32 text-xs ${monospace ? "font-mono" : ""}`}
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
