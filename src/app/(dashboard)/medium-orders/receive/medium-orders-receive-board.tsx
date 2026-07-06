"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type PendingDay = {
  id: string;
  orderId: string;
  date: string;
  m03: number;
  m05: number;
  t01: number;
  t05: number;
  handedOverAt: string;
  order: { code: string; instructions: { code: string; plantType: { name: string } }[] };
};

export default function MediumOrdersReceiveBoard() {
  const [days, setDays] = useState<PendingDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/medium-order-days?status=pending");
      const data = await res.json();
      setDays(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirm = async (day: PendingDay) => {
    setConfirmingId(day.id);
    try {
      const res = await fetch(`/api/medium-orders/${day.orderId}/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận bàn giao thành công");
      load();
    } finally {
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-cyan-600" /> Nhận môi trường
        </h1>
        <p className="text-gray-500 text-sm mt-1">{days.length} ngày chờ xác nhận</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : days.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <FlaskConical className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Không có ngày nào đang chờ xác nhận</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-green-700">
                    <th className="text-left px-4 py-3 font-medium text-white">Đơn</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Chỉ định</th>
                    <th className="text-left px-4 py-3 font-medium text-white">Ngày</th>
                    <th className="text-right px-4 py-3 font-medium text-white">M03</th>
                    <th className="text-right px-4 py-3 font-medium text-white">M05</th>
                    <th className="text-right px-4 py-3 font-medium text-white">T01</th>
                    <th className="text-right px-4 py-3 font-medium text-white">T05</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                      <td className="px-4 py-3 font-mono text-cyan-700">{d.order.code}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {d.order.instructions.map((i) => i.code).join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-yellow-100 text-yellow-700">{format(new Date(d.date), "EEEE, dd/MM", { locale: vi })}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{d.m03.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right">{d.m05.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right">{d.t01.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-right">{d.t05.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" disabled={confirmingId === d.id} onClick={() => confirm(d)}>
                          {confirmingId === d.id ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                          Xác nhận
                        </Button>
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
