"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, CheckCircle2, Trophy } from "lucide-react";
import { toast } from "sonner";
import DarkRoomInspectionDialog from "@/components/shared/dark-room-inspection-dialog";

type ChecklistItem = {
  id: string;
  title: string;
  kind: "SIMPLE" | "DARK_ROOM_CHECK";
  completed: boolean;
  subTask1Done: boolean;
  subTask2Done: boolean;
};

export default function DarkRoomCheckBoard() {
  const [item, setItem] = useState<ChecklistItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/today");
      const data = await res.json();
      const found = Array.isArray(data) ? data.find((i: ChecklistItem) => i.kind === "DARK_ROOM_CHECK") : null;
      setItem(found ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSubTask2 = async () => {
    if (!item) return;
    const checking = !item.subTask2Done;
    setSaving(true);
    try {
      const res = await fetch(`/api/checklist/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subTask2Done: checking }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setItem(json);
      if (json.completed) {
        toast.success("Xuất sắc! Bạn đã hoàn thành \"Kiểm tra kho tối\" hôm nay 🎉", {
          icon: <Trophy className="w-4 h-4 text-achievement-foreground" />,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (!item) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-success-foreground" />
        <p>Không có việc &quot;Kiểm tra kho tối&quot; nào cần làm hôm nay.</p>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          {item.completed ? <CheckCircle2 className="w-6 h-6 text-success-foreground shrink-0" /> : <div className="w-6 h-6 shrink-0 rounded-full border-2 border-divider" />}
          <div>
            <p className="font-semibold text-foreground">{item.completed ? "Đã hoàn thành hôm nay" : "Chưa hoàn thành"}</p>
            <p className="text-sm text-text-secondary">Cần xong cả 2 nhiệm vụ nhỏ dưới đây</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {item.subTask1Done ? <CheckCircle2 className="w-5 h-5 text-success-foreground shrink-0" /> : <div className="w-5 h-5 shrink-0 rounded-full border-2 border-divider" />}
            <div>
              <p className="font-medium text-foreground">1. Kiểm tra kho cá nhân</p>
              <p className="text-sm text-text-secondary">Chọn NV cấy mô, ghi nhận lỗi vi phạm nếu có — cần ít nhất 1 lượt/ngày</p>
            </div>
          </div>
          <DarkRoomInspectionDialog checklistItemId={item.id} onSaved={load} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <Checkbox checked={item.subTask2Done} disabled={saving} onCheckedChange={toggleSubTask2} />
            <div>
              <p className="font-medium text-foreground">2. Kiểm tra kho nhiễm cá nhân</p>
              <p className="text-sm text-text-secondary">Xác nhận đã chuyển cây nhiễm từ kho nhiễm cá nhân về kho nhiễm chung</p>
            </div>
            {saving && <Loader2 className="w-4 h-4 animate-spin text-text-muted" />}
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
