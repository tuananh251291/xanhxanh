"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Send, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { MEDIUM_ORDER_DAY_STATUS_LABELS, type UserRole } from "@/types";

type OrderItem = { id: string; stageCode: string; quantity: number; mediumType: { code: string; name: string } };
type OrderDay = {
  id: string;
  date: string;
  m03: number;
  m05: number;
  t01: number;
  t05: number;
  handedOverAt: string | null;
  confirmedAt: string | null;
};
type Order = {
  id: string;
  code: string;
  weekStart: string;
  weekEnd: string;
  confirmedAt: string | null;
  instructions: { code: string; plantType: { name: string } }[];
  items: OrderItem[];
  days: OrderDay[];
};

type QuantityField = "m03" | "m05" | "t01" | "t05";
const FIELDS: QuantityField[] = ["m03", "m05", "t01", "t05"];

const NUMBER_INPUT_CLASS = "w-20 text-right ml-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function dayStatus(day: OrderDay) {
  if (day.confirmedAt) return { label: MEDIUM_ORDER_DAY_STATUS_LABELS.CONFIRMED, color: "bg-green-100 text-green-700" };
  if (day.handedOverAt) return { label: MEDIUM_ORDER_DAY_STATUS_LABELS.HANDED_OVER, color: "bg-yellow-100 text-yellow-700" };
  return { label: MEDIUM_ORDER_DAY_STATUS_LABELS.NOT_HANDED_OVER, color: "bg-gray-100 text-gray-600" };
}

export default function MediumOrderDetail({ orderId, role }: { orderId: string; role: UserRole | null }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Record<QuantityField, string>>>({});
  const [savingDayId, setSavingDayId] = useState<string | null>(null);

  const isMoiTruong = role === "MOI_TRUONG";
  const isKhoMo = role === "KHO_MO";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/medium-orders/${orderId}`);
      if (!res.ok) { setOrder(null); return; }
      const data: Order = await res.json();
      setOrder(data);
      setDrafts(Object.fromEntries(data.days.map((d) => [d.id, { m03: String(d.m03), m05: String(d.m05), t01: String(d.t01), t05: String(d.t05) }])));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const setDraftField = (dayId: string, field: QuantityField, value: string) => {
    setDrafts((prev) => ({ ...prev, [dayId]: { ...prev[dayId], [field]: value } }));
  };

  const handover = async (day: OrderDay) => {
    setSavingDayId(day.id);
    try {
      const draft = drafts[day.id];
      const quantities = Object.fromEntries(FIELDS.map((f) => [f, Number(draft[f]) || 0]));
      const saveRes = await fetch(`/api/medium-orders/${orderId}/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quantities),
      });
      if (!saveRes.ok) { toast.error((await saveRes.json()).message ?? "Có lỗi xảy ra"); return; }

      const handoverRes = await fetch(`/api/medium-orders/${orderId}/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "handover" }),
      });
      if (!handoverRes.ok) { toast.error((await handoverRes.json()).message ?? "Có lỗi xảy ra"); return; }

      toast.success("Đã bàn giao — chờ Kho mô xác nhận");
      load();
    } finally {
      setSavingDayId(null);
    }
  };

  const confirmDay = async (day: OrderDay) => {
    setSavingDayId(day.id);
    try {
      const res = await fetch(`/api/medium-orders/${orderId}/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã xác nhận bàn giao thành công");
      load();
    } finally {
      setSavingDayId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!order) return <p className="text-sm text-gray-400 text-center py-12">Không tìm thấy đơn</p>;

  const totals = order.days.reduce(
    (acc, d) => ({ m03: acc.m03 + d.m03, m05: acc.m05 + d.m05, t01: acc.t01 + d.t01, t05: acc.t05 + d.t05 }),
    { m03: 0, m05: 0, t01: 0, t05: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/medium-orders"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{order.code}</h1>
          <p className="text-gray-500 text-sm">
            {order.instructions.length} chỉ định ·{" "}
            {format(new Date(order.weekStart), "dd/MM", { locale: vi })} – {format(new Date(order.weekEnd), "dd/MM/yyyy", { locale: vi })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Chỉ định cấy gộp trong đơn này</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {order.instructions.map((inst) => (
            <Badge key={inst.code} variant="outline">
              <span className="font-mono">{inst.code}</span> — {inst.plantType.name}
            </Badge>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Quy cách cần pha</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-700">
                  <th className="text-left px-4 py-2 font-medium text-white">Quy cách</th>
                  <th className="text-left px-4 py-2 font-medium text-white">Mã môi trường</th>
                  <th className="text-right px-4 py-2 font-medium text-white">SL cần</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0 even:bg-green-50">
                    <td className="px-4 py-2"><Badge variant="outline">{item.stageCode}</Badge></td>
                    <td className="px-4 py-2 font-mono text-cyan-700">{item.mediumType.code} <span className="text-gray-500 font-sans">— {item.mediumType.name}</span></td>
                    <td className="px-4 py-2 text-right font-medium">{item.quantity.toLocaleString("vi-VN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bảng pha theo ngày</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-green-700 text-white">
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Ngày</th>
                  <th className="px-3 py-2 text-right font-medium">M03</th>
                  <th className="px-3 py-2 text-right font-medium">M05</th>
                  <th className="px-3 py-2 text-right font-medium">T01</th>
                  <th className="px-3 py-2 text-right font-medium">T05</th>
                  <th className="px-3 py-2 text-center font-medium">Bàn giao</th>
                  <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {order.days.map((day) => {
                  const status = dayStatus(day);
                  const editable = isMoiTruong && !day.handedOverAt;
                  const draft = drafts[day.id];
                  return (
                    <tr key={day.id} className="border-b last:border-0 even:bg-green-50">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {format(new Date(day.date), "EEEE, dd/MM", { locale: vi })}
                      </td>
                      {FIELDS.map((field) => (
                        <td key={field} className="px-2 py-2">
                          {editable ? (
                            <Input
                              type="number" min={0}
                              className={NUMBER_INPUT_CLASS}
                              value={draft?.[field] ?? "0"}
                              onChange={(e) => setDraftField(day.id, field, e.target.value)}
                            />
                          ) : (
                            <p className="text-right text-gray-700">{day[field].toLocaleString("vi-VN")}</p>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center">
                        {editable && (
                          <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" disabled={savingDayId === day.id} onClick={() => handover(day)}>
                            {savingDayId === day.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                            {savingDayId !== day.id && "Bàn giao"}
                          </Button>
                        )}
                        {isKhoMo && day.handedOverAt && !day.confirmedAt && (
                          <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700" disabled={savingDayId === day.id} onClick={() => confirmDay(day)}>
                            {savingDayId === day.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                            {savingDayId !== day.id && "Xác nhận"}
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-2"><Badge className={status.color}>{status.label}</Badge></td>
                    </tr>
                  );
                })}
                <tr className="border-b bg-blue-50 font-semibold">
                  <td className="px-3 py-2">Tổng cộng</td>
                  <td className="px-3 py-2 text-right">{totals.m03.toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-right">{totals.m05.toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-right">{totals.t01.toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-right">{totals.t05.toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2" colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
