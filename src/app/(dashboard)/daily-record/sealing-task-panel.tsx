"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, PackageCheck, PackageOpen, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

type SealingItem = { id: string; plantType: { code: string; name: string }; stageCode: string; quantity: number };
type SealingTask = { id: string; code: string; status: "ASSIGNED" | "IN_PROGRESS"; items: SealingItem[] };

// Việc hàn túi (SealingTask) — NV cấy mô hỗ trợ Kho thành phẩm, tách biệt hoàn toàn với "Chỉ định cấy
// xử lý" (RepackInstruction) ở panel bên trên — chạy song song, không dùng chung model. 2 bước: (1) NV
// xác nhận "Nhận bàn giao" khi Kho mô vừa giao việc (ASSIGNED → IN_PROGRESS, giống bước xác nhận nhận
// mẫu mẹ của chỉ định cấy — tồn KHÔNG trừ lại ở đây, đã trừ ngay lúc Kho mô giao việc), (2) "Hoàn thành"
// khi đã hàn túi xong ĐỦ 100% số lượng đã giao (không cho khai thiếu do hao hụt) → PENDING_RECEIPT.
export default function SealingTaskPanel() {
  const router = useRouter();
  const [tasks, setTasks] = useState<SealingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [confirmReceiveTask, setConfirmReceiveTask] = useState<SealingTask | null>(null);
  const [confirmDoneTask, setConfirmDoneTask] = useState<SealingTask | null>(null);

  const load = useCallback(() => {
    fetch("/api/sealing-tasks?status=ASSIGNED,IN_PROGRESS")
      .then((r) => r.json())
      .then((data: SealingTask[]) => setTasks(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmReceived = async (task: SealingTask) => {
    setConfirmingId(task.id);
    try {
      const res = await fetch(`/api/sealing-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmReceived: true }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận việc hàn túi");
      load();
      router.refresh();
    } finally {
      setConfirmingId(null);
    }
  };

  const handBack = async (task: SealingTask) => {
    setSubmittingId(task.id);
    try {
      // Luôn bàn giao ĐỦ số lượng đã giao — không còn ô nhập tay (xem comment đầu file).
      const items = task.items.map((item) => ({ itemId: item.id, reportedQuantity: item.quantity }));
      const res = await fetch(`/api/sealing-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handBack: { items } }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã bàn giao kết quả hàn túi — chờ Kho thành phẩm xác nhận");
      load();
      router.refresh();
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading || tasks.length === 0) return null;

  const assignedTasks = tasks.filter((t) => t.status === "ASSIGNED");
  const inProgressTasks = tasks.filter((t) => t.status === "IN_PROGRESS");

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <PackageOpen className="w-4 h-4 text-primary-strong" /> Việc hàn túi
        </h2>

        {assignedTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Việc mới — cần xác nhận nhận</p>
            {assignedTasks.map((task) => (
              <div key={task.id} className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-foreground font-mono">{task.code}</p>
                <div className="space-y-1 text-sm text-text-secondary">
                  {task.items.map((item) => (
                    <p key={item.id}>
                      {item.plantType.name} <span className="font-medium">({item.stageCode})</span> — {item.quantity.toLocaleString("vi-VN")}
                    </p>
                  ))}
                </div>
                <Button
                  size="sm" className="h-8 bg-primary hover:bg-primary-hover"
                  disabled={confirmingId === task.id}
                  onClick={() => setConfirmReceiveTask(task)}
                >
                  {confirmingId === task.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5 mr-1.5" />}
                  Xác nhận nhận bàn giao
                </Button>
              </div>
            ))}
          </div>
        )}

        {inProgressTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-secondary">Đang làm</p>
            {inProgressTasks.map((task) => (
              <div key={task.id} className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-foreground font-mono">{task.code}</p>
                <div className="space-y-1 text-sm text-text-secondary">
                  {task.items.map((item) => (
                    <p key={item.id}>
                      {item.plantType.name} <span className="font-medium">({item.stageCode})</span> — {item.quantity.toLocaleString("vi-VN")}
                    </p>
                  ))}
                </div>
                <Button
                  size="sm" className="h-8 bg-primary hover:bg-primary-hover"
                  disabled={submittingId === task.id}
                  onClick={() => setConfirmDoneTask(task)}
                >
                  {submittingId === task.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
                  Hoàn thành – Bàn giao kết quả
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!confirmReceiveTask} onOpenChange={(v) => { if (!v) setConfirmReceiveTask(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirmReceiveTask && (
            <>
              <DialogHeader>
                <DialogTitle>Xác nhận nhận bàn giao?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-text-secondary">
                Xác nhận đã nhận việc hàn túi {confirmReceiveTask.code} — sau khi xác nhận mới được bắt đầu tính là đang làm.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmReceiveTask(null)}>Huỷ</Button>
                <Button
                  className="bg-primary hover:bg-primary-hover"
                  onClick={() => { const t = confirmReceiveTask; setConfirmReceiveTask(null); confirmReceived(t); }}
                >
                  Xác nhận
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDoneTask} onOpenChange={(v) => { if (!v) setConfirmDoneTask(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirmDoneTask && (
            <>
              <DialogHeader>
                <DialogTitle>Xác nhận hoàn thành?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-text-secondary">
                Xác nhận đã hàn túi xong ĐỦ số lượng đã giao và bàn giao kết quả — không sửa lại được sau khi gửi?
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDoneTask(null)}>Huỷ</Button>
                <Button
                  className="bg-primary hover:bg-primary-hover"
                  onClick={() => { const t = confirmDoneTask; setConfirmDoneTask(null); handBack(t); }}
                >
                  Xác nhận
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
