"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";

type RotationKind = "RA_RE" | "MAU_ME";

const KIND_LABELS: Record<RotationKind, string> = {
  RA_RE: "Nhóm tuần ra rễ",
  MAU_ME: "Nhóm tuần mẫu mẹ",
};

const weekLabel = (v: string) => v.replace(/^(\d{4})-W(\d{2})$/, "Tuần $2/$1");

// Cạnh ô "Tìm theo giàn kệ" của trang Phòng ra rễ/Phòng mẫu mẹ — chỉ SUPER_ADMIN mới thấy (xem
// shelf-list-view.tsx). Chọn 1 tuần thật (input type="week" tự sinh đúng định dạng ISO 8601 "YYYY-Www")
// làm mốc Nhóm 1 của đúng loại xoay vòng (kind) — các Nhóm tiếp theo tự tính là các tuần liên tiếp sau
// đó, quay lại Nhóm 1 sau khi hết vòng, lặp lại vô hạn qua các năm sau (xem getCurrentWeekSlot ở
// src/lib/week-rotation.ts). Lưu RIÊNG cho đúng kho của phòng đang xem (không đổi lịch kho khác) — kho
// chưa đặt riêng dùng giá trị chung (xem src/lib/rotation-epoch.ts).
export default function RotationStartWeekForm({
  kind,
  warehouseId,
  warehouseName,
}: {
  kind: RotationKind;
  warehouseId: string;
  warehouseName: string;
}) {
  const [value, setValue] = useState("");
  const [ownValue, setOwnValue] = useState<string | null>(null);
  const [globalValue, setGlobalValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/settings/rotation-start-week?kind=${kind}&warehouseId=${encodeURIComponent(warehouseId)}`)
      .then((r) => r.json())
      .then((data: { startWeek: string | null; globalStartWeek: string | null }) => {
        setOwnValue(data.startWeek);
        setGlobalValue(data.globalStartWeek);
        setValue(data.startWeek ?? data.globalStartWeek ?? "");
      })
      .finally(() => setLoading(false));
  }, [kind, warehouseId]);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  const submit = async (startWeek: string | null) => {
    if (startWeek === "") {
      toast.error("Cần chọn tuần khởi đầu");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/rotation-start-week", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, startWeek, warehouseId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.message ?? "Có lỗi xảy ra");
        return;
      }
      toast.success(
        startWeek
          ? `Đã lưu riêng cho ${warehouseName} — các ${KIND_LABELS[kind]} tiếp theo của kho này tự tính lại theo tuần này`
          : `${warehouseName} đã quay về dùng giá trị chung`
      );
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs">Tuần khởi đầu của {KIND_LABELS[kind]} 1 — riêng {warehouseName}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="week"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={loading}
          className="w-44"
        />
        <Button type="button" size="sm" onClick={() => submit(value)} disabled={saving || loading}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
          Lưu
        </Button>
        {ownValue && (
          <Button type="button" size="sm" variant="outline" onClick={() => submit(null)} disabled={saving || loading}>
            <Undo2 className="w-4 h-4 mr-1" /> Dùng giá trị chung
          </Button>
        )}
      </div>
      {!loading && (
        <p className="text-xs text-text-secondary max-w-xs">
          {ownValue
            ? `Đang dùng giá trị riêng của kho này (${weekLabel(ownValue)}).`
            : globalValue
            ? `Kho này chưa đặt riêng — đang dùng giá trị chung (${weekLabel(globalValue)}).`
            : "Chưa cấu hình tuần khởi đầu."}{" "}
          Chỉ áp dụng cho {warehouseName}, không ảnh hưởng khu sản xuất khác.
        </p>
      )}
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
