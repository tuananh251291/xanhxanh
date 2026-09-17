"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PackageCheck, PackageOpen } from "lucide-react";
import { toast } from "sonner";

type SealingItem = { id: string; plantType: { code: string; name: string }; stageCode: string; quantity: number };
type SealingTask = { id: string; code: string; items: SealingItem[] };

// Việc hàn túi (SealingTask) — NV cấy mô hỗ trợ Kho thành phẩm, tách biệt hoàn toàn với "Chỉ định cấy
// xử lý" (RepackInstruction) ở panel bên trên — chạy song song, không dùng chung model. Chỉ 1 bước
// "Hoàn thành" (không tách nhận bàn giao/số lượng không đủ như RepackInstruction) vì số lượng đã bị
// trừ NGAY lúc Kho mô giao việc, không có bước NV xác nhận nhận riêng.
export default function SealingTaskPanel() {
  const router = useRouter();
  const [tasks, setTasks] = useState<SealingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [confirmTask, setConfirmTask] = useState<SealingTask | null>(null);

  const load = useCallback(() => {
    fetch("/api/sealing-tasks?status=IN_PROGRESS")
      .then((r) => r.json())
      .then((data: SealingTask[]) => setTasks(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handBack = async (task: SealingTask) => {
    setSubmittingId(task.id);
    try {
      const items = task.items.map((item) => ({ itemId: item.id, reportedQuantity: Math.max(0, Math.min(item.quantity, parseInt(quantities[item.id] ?? "0", 10) || 0)) }));
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

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <PackageOpen className="w-4 h-4 text-primary-strong" /> Việc hàn túi
        </h2>

        {tasks.map((task) => (
          <div key={task.id} className="border rounded-lg p-3 space-y-2">
            <p className="text-sm font-medium text-foreground font-mono">{task.code}</p>
            <div className="space-y-1.5">
              {task.items.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">
                    {item.plantType.name} <span className="font-medium">({item.stageCode})</span> — giao {item.quantity.toLocaleString("vi-VN")}
                  </span>
                  <div className="space-y-1">
                    <Label className="text-xs">SL thực làm được</Label>
                    <Input
                      type="number" min={0} max={item.quantity} className="w-24 h-8"
                      value={quantities[item.id] ?? ""}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Button
              size="sm" className="h-8 bg-primary hover:bg-primary-hover"
              disabled={submittingId === task.id}
              onClick={() => setConfirmTask(task)}
            >
              {submittingId === task.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5 mr-1.5" />}
              Hoàn thành – Bàn giao kết quả
            </Button>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!confirmTask} onOpenChange={(v) => { if (!v) setConfirmTask(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirmTask && (
            <>
              <DialogHeader>
                <DialogTitle>Xác nhận hoàn thành?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-text-secondary">Xác nhận đã hàn túi xong và bàn giao kết quả — không sửa lại được sau khi gửi?</p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmTask(null)}>Huỷ</Button>
                <Button
                  className="bg-primary hover:bg-primary-hover"
                  onClick={() => { const t = confirmTask; setConfirmTask(null); handBack(t); }}
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
