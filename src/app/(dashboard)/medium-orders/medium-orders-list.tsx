"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Loader2, Check, Search } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { MEDIUM_ORDER_STATUS_LABELS } from "@/types";
import { isMediumOrderInProgress, type MediumOrderDayLike } from "@/lib/medium-orders";

type MediumOrder = {
  id: string;
  code: string;
  weekStart: string;
  weekEnd: string;
  confirmedAt: string | null;
  confirmedById: string | null;
  days: MediumOrderDayLike[];
  instructions: { code: string; plantType: { name: string } }[];
};

export default function MediumOrdersList({ canConfirm, currentUserId }: { canConfirm: boolean; currentUserId: string | null }) {
  const [orders, setOrders] = useState<MediumOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/medium-orders");
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Đơn mà chính NV môi trường này đang xử lý (đã xác nhận, chưa kết thúc) — nếu có, chặn xác nhận
  // bất kỳ đơn nào khác cho tới khi đơn này kết thúc.
  const myActiveOrder = currentUserId
    ? orders.find((o) => o.confirmedById === currentUserId && isMediumOrderInProgress(o))
    : undefined;

  const confirm = async (id: string) => {
    setConfirmingId(id);
    try {
      const res = await fetch(`/api/medium-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận đơn — đơn chuyển sang Đang thực hiện");
      load();
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-secondary-foreground" /> Đơn đặt hàng môi trường
        </h1>
        <p className="text-text-secondary text-sm mt-1">{orders.length} đơn</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : orders.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có đơn đặt hàng môi trường nào</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã đơn</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Chỉ định</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Loại cây</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tuần pha</th>
                    <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Trạng thái</th>
                    <th className="px-4 py-3 font-bold text-base"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                      <td className="px-4 py-3 font-mono font-medium text-secondary-foreground">{o.code}</td>
                      <td className="px-4 py-3 font-mono text-info-foreground">
                        {o.instructions.map((i) => i.code).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {Array.from(new Set(o.instructions.map((i) => i.plantType.name))).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {format(new Date(o.weekStart), "dd/MM", { locale: vi })} – {format(new Date(o.weekEnd), "dd/MM/yyyy", { locale: vi })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={o.confirmedAt ? "bg-info-light text-info-foreground" : "bg-warning-light text-warning-foreground"}>
                          {o.confirmedAt ? MEDIUM_ORDER_STATUS_LABELS.IN_PROGRESS : MEDIUM_ORDER_STATUS_LABELS.UNCONFIRMED}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/medium-orders/${o.id}`}>
                            <Button size="sm" variant="outline" className="h-8">
                              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                            </Button>
                          </Link>
                          {!o.confirmedAt && canConfirm && (() => {
                            const blocked = !!myActiveOrder && myActiveOrder.id !== o.id;
                            return (
                              <Button
                                size="sm"
                                className={`h-8 bg-primary hover:bg-primary-hover ${blocked ? "opacity-50 hover:bg-primary cursor-not-allowed" : ""}`}
                                disabled={confirmingId === o.id}
                                onClick={() => {
                                  if (blocked) { toast.error("Bạn cần hoàn thành đơn sản xuất hiện tại"); return; }
                                  confirm(o.id);
                                }}
                              >
                                {confirmingId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                                {confirmingId !== o.id && "Xác nhận"}
                              </Button>
                            );
                          })()}
                        </div>
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
