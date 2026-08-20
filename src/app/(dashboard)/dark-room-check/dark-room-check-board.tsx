"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Trophy } from "lucide-react";
import { toast } from "sonner";
import DarkRoomInspectionDialog from "@/components/shared/dark-room-inspection-dialog";
import ContaminationPersonalBoard from "./contamination-personal-board";

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
  const wasCompleted = useRef(false);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/today");
      const data = await res.json();
      const found = Array.isArray(data) ? data.find((i: ChecklistItem) => i.kind === "DARK_ROOM_CHECK") : null;
      setItem(found ?? null);
      // "2. Kiểm tra kho nhiễm cá nhân" tự hoàn thành phía server (xem
      // POST /api/personal-contamination-checks) chứ không qua thao tác trực tiếp ở đây, nên phát hiện
      // thời điểm hoàn thành bằng cách so sánh trạng thái trước/sau khi tải lại — bỏ qua lần tải đầu tiên
      // (mở trang) để không báo mừng lại việc đã xong từ trước.
      if (hasLoadedOnce.current && found?.completed && !wasCompleted.current) {
        toast.success("Xuất sắc! Bạn đã hoàn thành \"Kiểm tra kho tối\" hôm nay 🎉", {
          icon: <Trophy className="w-4 h-4 text-achievement-foreground" />,
        });
      }
      wasCompleted.current = found?.completed ?? false;
      hasLoadedOnce.current = true;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
              <p className="text-sm text-text-secondary">Ghi nhận lỗi vi phạm nếu có (không bắt buộc chọn NV) — cần ít nhất 1 lượt/ngày</p>
            </div>
          </div>
          <DarkRoomInspectionDialog checklistItemId={item.id} onSaved={load} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            {item.subTask2Done ? <CheckCircle2 className="w-5 h-5 text-success-foreground shrink-0" /> : <div className="w-5 h-5 shrink-0 rounded-full border-2 border-divider" />}
            <div>
              <p className="font-medium text-foreground">2. Kiểm tra kho nhiễm cá nhân</p>
              <p className="text-sm text-text-secondary">Tự động hoàn thành khi đã &quot;Kiểm tra xong&quot; hết kho nhiễm cá nhân của mọi NV cấy mô bên dưới</p>
            </div>
          </div>
          <div className="border-t border-divider pt-4">
            <ContaminationPersonalBoard onChecked={load} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
