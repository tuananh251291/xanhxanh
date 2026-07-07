"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FlaskConical, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isMediumOrderReceived, type MediumOrderDayLike } from "@/lib/medium-orders";

type MediumOrder = {
  id: string;
  code: string;
  weekStart: string;
  weekEnd: string;
  days: MediumOrderDayLike[];
  instructions: { code: string; plantType: { name: string } }[];
};

function OrderTable({ title, orders, emptyLabel }: { title: string; orders: MediumOrder[]; emptyLabel: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" /> {title}
        </CardTitle>
        <p className="text-text-secondary text-sm">{orders.length} đơn</p>
      </CardHeader>
      <CardContent className="p-0">
        {orders.length === 0 ? (
          <p className="py-10 text-center text-text-muted text-sm">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Mã đơn</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Chỉ định</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Loại cây</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tuần pha</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Tiến độ</th>
                  <th className="px-4 py-3 font-bold text-base"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const confirmedDays = o.days.filter((d) => d.confirmedAt).length;
                  return (
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
                      <td className="px-4 py-3 text-text-secondary">{confirmedDays}/{o.days.length} ngày đã nhận</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Link href={`/medium-orders/${o.id}`}>
                            <Button size="sm" variant="outline" className="h-8">
                              <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MediumOrdersReceiveBoard() {
  const [orders, setOrders] = useState<MediumOrder[]>([]);
  const [loading, setLoading] = useState(true);

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

  const received = orders.filter((o) => isMediumOrderReceived(o.days));
  const inProgress = orders.filter((o) => !isMediumOrderReceived(o.days));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-secondary-foreground" /> Nhận môi trường
        </h1>
        <p className="text-text-secondary text-sm mt-1">{orders.length} đơn đã xác nhận</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
      ) : (
        <>
          <OrderTable title="Danh sách đơn đặt hàng môi trường đã nhận" orders={received} emptyLabel="Chưa có đơn nào đã nhận đủ" />
          <OrderTable title="Danh sách đơn đặt hàng môi trường đang bàn giao" orders={inProgress} emptyLabel="Không có đơn nào đang bàn giao" />
        </>
      )}
    </div>
  );
}
