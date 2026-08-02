"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

type RotationKind = "RA_RE" | "MAU_ME";

const KIND_LABELS: Record<RotationKind, string> = {
  RA_RE: "Nhóm tuần ra rễ",
  MAU_ME: "Nhóm tuần mẫu mẹ",
};

// Cạnh ô "Tìm theo giàn kệ" của trang Phòng ra rễ/Phòng mẫu mẹ — chỉ SUPER_ADMIN mới thấy (xem
// shelf-list-view.tsx). Chọn 1 tuần thật (input type="week" tự sinh đúng định dạng ISO 8601 "YYYY-Www")
// làm mốc Nhóm 1 của đúng loại xoay vòng (kind) — các Nhóm tiếp theo tự tính là các tuần liên tiếp sau
// đó, quay lại Nhóm 1 sau khi hết vòng, lặp lại vô hạn qua các năm sau (xem getCurrentWeekSlot ở
// src/lib/week-rotation.ts). Nhóm tuần mẫu mẹ hiện chưa có nơi nào tiêu thụ "khe đang active" như Nhóm
// tuần ra rễ dùng cho planShelfAssignments — cấu hình ở đây trước để sẵn sàng khi cần, không ảnh hưởng gì
// tới cách xếp kệ mẫu mẹ hiện tại (vẫn xoay vòng qua mọi Nhóm của NV, không phân biệt Nhóm nào "đang active").
export default function RotationStartWeekForm({ kind }: { kind: RotationKind }) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/settings/rotation-start-week?kind=${kind}`)
      .then((r) => r.json())
      .then((data: { startWeek: string | null }) => setValue(data.startWeek ?? ""))
      .finally(() => setLoading(false));
  }, [kind]);

  const save = async () => {
    if (!value) {
      toast.error("Cần chọn tuần khởi đầu");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/rotation-start-week", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, startWeek: value }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(`Đã lưu — các ${KIND_LABELS[kind]} tiếp theo tự tính lại theo tuần này`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">Tuần khởi đầu của {KIND_LABELS[kind]} 1</Label>
      <div className="flex items-center gap-2">
        <Input
          type="week"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={loading}
          className="w-44"
        />
        <Button type="button" size="sm" onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Lưu
        </Button>
      </div>
      {kind === "RA_RE" ? (
        <p className="text-xs text-text-secondary max-w-xs">
          VD chọn Tuần 27 → Nhóm 2 là tuần 28, Nhóm 3 là tuần 29, Nhóm 4 là tuần 30, rồi quay lại Nhóm 1 ở tuần 31, cứ thế lặp lại sang các năm sau.
        </p>
      ) : (
        <p className="text-xs text-text-secondary max-w-xs">
          VD chọn Tuần 27 → Nhóm 2 là tuần 28, Nhóm 3 là tuần 29... rồi quay lại Nhóm 1, nhưng chu kỳ bao
          nhiêu tuần thì quay lại (N) tính riêng theo &quot;Thời gian đợi cấy chuyển&quot; của TỪNG mã cây
          đang xếp trên kệ, không cố định theo số Nhóm đã tạo — mã cây N=4 tuần và mã cây N=6 tuần cùng
          nằm trong 1 Nhóm (VD cùng &quot;MM1&quot;) sẽ đến hạn ở các tuần khác nhau sau vòng đầu tiên.
        </p>
      )}
    </div>
  );
}
