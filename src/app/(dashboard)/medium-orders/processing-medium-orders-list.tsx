"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Beaker, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import { PROCESSING_MEDIUM_ORDER_STATUS_LABELS } from "@/types";

type ProcessingMediumOrder = {
  id: string;
  code: string;
  quantity: number;
  notes: string;
  status: "PENDING" | "COMPLETED";
  createdAt: string;
  mediumType: { code: string; name: string };
  processingRequest: {
    code: string;
    sourceStageCode: string;
    plantType: { name: string };
    order: { code: string };
  };
  completedBy: { name: string; code: string } | null;
};

export default function ProcessingMediumOrdersList({ canComplete }: { canComplete: boolean }) {
  const [orders, setOrders] = useState<ProcessingMediumOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/processing-medium-orders");
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const complete = async (id: string) => {
    setCompletingId(id);
    try {
      const res = await fetch(`/api/processing-medium-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã hoàn thành đơn môi trường");
      load();
    } finally {
      setCompletingId(null);
    }
  };

  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Beaker className="w-5 h-5 text-secondary-foreground" /> Đơn môi trường cho xử lý cây
        </h2>
        <p className="text-text-secondary text-sm mt-1">
          Phát sinh tự động khi Sale xác nhận đơn hàng cần tách/ghép túi — {pendingCount} đơn chờ pha
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">
          <Beaker className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có đơn môi trường nào cho đơn xử lý</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã đơn</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Ghi chú</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Loại môi trường</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Số lượng</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                    <th className="px-4 py-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      <td className="px-4 py-3 font-mono font-medium text-secondary-foreground">
                        {o.code}
                        <p className="text-xs text-text-muted font-sans font-normal mt-0.5">
                          {formatDistanceToNow(new Date(o.createdAt), { addSuffix: true, locale: vi })}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary max-w-xs">
                        <p>{o.notes}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {o.processingRequest.plantType.name} · quy cách {o.processingRequest.sourceStageCode} · đơn hàng {o.processingRequest.order.code}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        Mã {o.mediumType.code} — {o.mediumType.name}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{o.quantity}</td>
                      <td className="px-4 py-3">
                        <Badge className={o.status === "COMPLETED" ? "bg-success-light text-success-foreground" : "bg-warning-light text-warning-foreground"}>
                          {PROCESSING_MEDIUM_ORDER_STATUS_LABELS[o.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {o.status === "PENDING" && canComplete && (
                          <Button
                            size="sm"
                            className="h-8 bg-primary hover:bg-primary-hover"
                            disabled={completingId === o.id}
                            onClick={() => complete(o.id)}
                          >
                            {completingId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                            {completingId !== o.id && "Hoàn thành"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
