"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PackageCheck, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

type SealingItem = { id: string; plantType: { code: string; name: string }; stageCode: string; quantity: number; reportedQuantity: number | null };
type SealingTask = { id: string; code: string; assignedTo: { name: string; code: string }; staffHandedBackAt: string; items: SealingItem[] };

// Kho thành phẩm xác nhận việc hàn túi NV cấy mô đã bàn giao — mặc định gợi ý đúng số NV tự khai
// (reportedQuantity), sửa được trước khi xác nhận (giống "thực nhận" ở Kho thị trường, xem
// market-receive-board.tsx).
export default function SealingTaskReceiveBoard() {
  const [tasks, setTasks] = useState<SealingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmedInputs, setConfirmedInputs] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sealing-tasks?status=PENDING_RECEIPT");
      const data = await res.json();
      setTasks(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getConfirmed = (item: SealingItem) => {
    const raw = confirmedInputs[item.id];
    if (raw !== undefined) return raw;
    return String(item.reportedQuantity ?? 0);
  };

  const confirm = async (task: SealingTask) => {
    setProcessing(task.id);
    try {
      const items = task.items.map((item) => ({ itemId: item.id, confirmedQuantity: Math.max(0, Math.min(item.quantity, parseInt(getConfirmed(item), 10) || 0)) }));
      const res = await fetch(`/api/sealing-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: { items } }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận nhận hàn túi");
      setExpanded(null);
      load();
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  }

  if (tasks.length === 0) {
    return (
      <Card><CardContent className="py-16 text-center text-text-muted">
        <PackageCheck className="w-10 h-10 mx-auto mb-3 text-text-muted" />
        <p>Không có việc hàn túi nào đang chờ nhận</p>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã việc</th>
                <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">NV hàn túi</th>
                <th className="text-center px-4 py-3 text-primary-strong font-bold text-base">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const isExpanded = expanded === task.id;
                return (
                  <Fragment key={task.id}>
                    <tr className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 font-mono text-text-secondary">{task.code}</td>
                      <td className="px-4 py-3 text-foreground">
                        {task.assignedTo.name} <span className="text-xs text-text-muted font-mono">({task.assignedTo.code})</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant={isExpanded ? "ghost" : "default"}
                          size="sm"
                          className={isExpanded ? "h-8" : "h-8 bg-primary hover:bg-primary-hover"}
                          onClick={() => setExpanded(isExpanded ? null : task.id)}
                        >
                          {isExpanded ? (
                            <><ChevronUp className="w-3.5 h-3.5 mr-1.5" /> Thu gọn</>
                          ) : (
                            <><ChevronDown className="w-3.5 h-3.5 mr-1.5" /> Xác nhận nhận hàng</>
                          )}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={3} className="bg-muted/30 px-4 py-4">
                          <div className="space-y-3">
                            <div className="overflow-x-auto border rounded-lg bg-background">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-primary-light">
                                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Mã cây</th>
                                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên cây</th>
                                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Quy cách</th>
                                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Đã giao</th>
                                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">NV tự khai</th>
                                    <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Xác nhận</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {task.items.map((item) => (
                                    <tr key={item.id} className="border-b last:border-0 even:bg-primary-light">
                                      <td className="px-3 py-2 font-mono text-xs">{item.plantType.code}</td>
                                      <td className="px-3 py-2">{item.plantType.name}</td>
                                      <td className="px-3 py-2 font-medium">{item.stageCode}</td>
                                      <td className="px-3 py-2">{item.quantity.toLocaleString("vi-VN")}</td>
                                      <td className="px-3 py-2 text-text-secondary">{(item.reportedQuantity ?? 0).toLocaleString("vi-VN")}</td>
                                      <td className="px-3 py-2">
                                        <Input
                                          type="number" min={0} max={item.quantity} className="w-24 h-8"
                                          value={getConfirmed(item)}
                                          onChange={(e) => setConfirmedInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary-hover"
                              onClick={() => confirm(task)}
                              disabled={processing === task.id}
                            >
                              {processing === task.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                              Xác nhận nhận hàng — cộng vào Phòng hàn túi
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
