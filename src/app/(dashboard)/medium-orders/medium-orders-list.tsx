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

type MediumOrder = {
  id: string;
  code: string;
  weekStart: string;
  weekEnd: string;
  confirmedAt: string | null;
  instructions: { code: string; plantType: { name: string } }[];
};

export default function MediumOrdersList({ canConfirm }: { canConfirm: boolean }) {
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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-cyan-600" /> Đơn đặt hàng môi trường
        </h1>
        <p className="text-gray-500 text-sm mt-1">{orders.length} đơn</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : orders.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Chưa có đơn đặt hàng môi trường nào</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700">
                    <th className="text-left px-4 py-3 font-medium text-white">Mã đơn</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Chỉ định</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Loại cây</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Tuần pha</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Trạng thái</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                      <td className="px-4 py-3 font-mono font-medium text-cyan-700">{o.code}</td>
                      <td className="px-4 py-3 font-mono text-blue-700">
                        {o.instructions.map((i) => i.code).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {Array.from(new Set(o.instructions.map((i) => i.plantType.name))).join(", ")}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {format(new Date(o.weekStart), "dd/MM", { locale: vi })} – {format(new Date(o.weekEnd), "dd/MM/yyyy", { locale: vi })}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={o.confirmedAt ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}>
                          {o.confirmedAt ? MEDIUM_ORDER_STATUS_LABELS.IN_PROGRESS : MEDIUM_ORDER_STATUS_LABELS.UNCONFIRMED}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.confirmedAt ? (
                          <Link href={`/medium-orders/${o.id}`}>
                            <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
                              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                            </Button>
                          </Link>
                        ) : canConfirm ? (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={confirmingId === o.id} onClick={() => confirm(o.id)}>
                            {confirmingId === o.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                            Xác nhận
                          </Button>
                        ) : null}
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
