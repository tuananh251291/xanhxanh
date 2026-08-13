"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ListChecks, Loader2, Trophy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import DarkRoomInspectionDialog from "./dark-room-inspection-dialog";

type ChecklistItem = {
  id: string;
  title: string;
  kind: "SIMPLE" | "DARK_ROOM_CHECK";
  completed: boolean;
  subTask1Done: boolean;
  subTask2Done: boolean;
  assignedDate: string;
};

export default function TodayChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/checklist/today");
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const celebrateIfDone = (item: ChecklistItem, nowCompleted: boolean) => {
    if (!nowCompleted) return;
    const allDone = items.every((i) => i.id === item.id || i.completed);
    if (allDone) {
      toast.success("Xuất sắc! Hôm nay bạn đã hoàn thành toàn bộ nhiệm vụ trong ngày. Cảm ơn vì sự nỗ lực của bạn!", {
        icon: <Trophy className="w-4 h-4 text-achievement-foreground" />,
      });
    } else {
      toast.success(`Xuất sắc! Bạn đã hoàn thành nhiệm vụ '${item.title}' 🎉`);
    }
  };

  const toggle = async (item: ChecklistItem) => {
    const completing = !item.completed;
    setSavingId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: completing } : i)));
    try {
      const res = await fetch(`/api/checklist/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: completing }),
      });
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, completed: item.completed } : i)));
        return;
      }
      celebrateIfDone(item, completing);
    } finally {
      setSavingId(null);
    }
  };

  const toggleSubTask2 = async (item: ChecklistItem) => {
    const checking = !item.subTask2Done;
    setSavingId(item.id);
    const nowCompleted = item.subTask1Done && checking;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, subTask2Done: checking, completed: nowCompleted } : i)));
    try {
      const res = await fetch(`/api/checklist/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subTask2Done: checking }),
      });
      if (!res.ok) {
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, subTask2Done: item.subTask2Done, completed: item.completed } : i)));
        return;
      }
      celebrateIfDone(item, nowCompleted);
    } finally {
      setSavingId(null);
    }
  };

  if (loading || items.length === 0) return null;

  const doneCount = items.filter((i) => i.completed).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-secondary-foreground" /> Việc cần làm hôm nay
          </CardTitle>
          <Badge variant="secondary">{doneCount}/{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) =>
          item.kind === "DARK_ROOM_CHECK" ? (
            <div key={item.id} className="py-1.5 text-sm border-b last:border-0 border-divider">
              <div className="flex items-center gap-2 font-medium">
                {item.completed ? <CheckCircle2 className="w-4 h-4 text-success-foreground shrink-0" /> : <ListChecks className="w-4 h-4 text-text-muted shrink-0" />}
                <span className={item.completed ? "line-through text-text-muted" : "text-foreground"}>{item.title}</span>
                {savingId === item.id && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
              </div>
              <div className="pl-6 mt-1.5 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {item.subTask1Done ? <CheckCircle2 className="w-3.5 h-3.5 text-success-foreground shrink-0" /> : <span className="w-3.5 h-3.5 shrink-0 rounded-full border border-divider" />}
                  <span className="text-text-secondary">Kiểm tra kho cá nhân</span>
                  <DarkRoomInspectionDialog checklistItemId={item.id} onSaved={load} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={item.subTask2Done} disabled={savingId === item.id} onCheckedChange={() => toggleSubTask2(item)} />
                  <span className="text-text-secondary">
                    Kiểm tra kho nhiễm cá nhân — Xác nhận đã chuyển cây nhiễm từ kho nhiễm cá nhân về kho nhiễm chung
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <label key={item.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
              <Checkbox
                checked={item.completed}
                disabled={savingId === item.id}
                onCheckedChange={() => toggle(item)}
              />
              <span className={item.completed ? "line-through text-text-muted" : "text-foreground"}>{item.title}</span>
              {savingId === item.id && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
            </label>
          )
        )}
      </CardContent>
    </Card>
  );
}
