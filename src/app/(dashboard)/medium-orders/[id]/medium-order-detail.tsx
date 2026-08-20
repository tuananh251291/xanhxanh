"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Send, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { MEDIUM_ORDER_DAY_STATUS_LABELS, isAdminRole, type UserRole } from "@/types";
import { isMediumOrderInProgress, isMediumSurplusEntryDay, quantityToBags, netBagsNeeded, getExecutionWeek, isSameVnCalendarDay } from "@/lib/medium-orders";
import EndMediumOrderEarlyButton from "./end-medium-order-early-button";

type OrderItem = { id: string; stageCode: string; quantity: number; surplusQuantity: number; mediumType: { code: string; name: string } };
type OrderDay = {
  id: string;
  date: string;
  m05: number;
  t01: number;
  t05: number;
  dayItems: { itemId: string; quantity: number }[];
  handedOverAt: string | null;
  confirmedAt: string | null;
};
type Order = {
  id: string;
  code: string;
  weekStart: string;
  weekEnd: string;
  confirmedAt: string | null;
  endedAt: string | null;
  surplusRecordedAt: string | null;
  items: OrderItem[];
  days: OrderDay[];
  actualProductionByStage: Record<string, number>;
};

const NUMBER_INPUT_CLASS = "block w-20 text-center mx-auto [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function dayStatus(day: OrderDay) {
  if (day.confirmedAt) return { label: MEDIUM_ORDER_DAY_STATUS_LABELS.CONFIRMED, color: "bg-primary-light text-primary-strong" };
  if (day.handedOverAt) return { label: MEDIUM_ORDER_DAY_STATUS_LABELS.HANDED_OVER, color: "bg-warning-light text-warning-foreground" };
  return { label: MEDIUM_ORDER_DAY_STATUS_LABELS.NOT_HANDED_OVER, color: "bg-muted text-text-secondary" };
}

export default function MediumOrderDetail({ orderId, role }: { orderId: string; role: UserRole | null }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingDayId, setSavingDayId] = useState<string | null>(null);
  const [surplusDrafts, setSurplusDrafts] = useState<Record<string, string>>({});
  const [savingSurplusItemId, setSavingSurplusItemId] = useState<string | null>(null);
  const [finishingSurplus, setFinishingSurplus] = useState(false);

  const isMoiTruong = role === "MOI_TRUONG";
  const isKhoMo = role === "KHO_MO";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/medium-orders/${orderId}`);
      if (!res.ok) { setOrder(null); return; }
      const data: Order = await res.json();
      setOrder(data);
      setDrafts(
        Object.fromEntries(
          data.days.map((d) => [
            d.id,
            Object.fromEntries(data.items.map((item) => [item.id, String(d.dayItems.find((di) => di.itemId === item.id)?.quantity ?? 0)])),
          ])
        )
      );
      setSurplusDrafts(Object.fromEntries(data.items.map((i) => [i.id, String(i.surplusQuantity)])));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  const setDraftField = (dayId: string, itemId: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [dayId]: { ...prev[dayId], [itemId]: value } }));
  };

  const handover = async (day: OrderDay) => {
    setSavingDayId(day.id);
    try {
      const draft = drafts[day.id];
      const items = (order?.items ?? []).map((item) => ({ itemId: item.id, quantity: Number(draft[item.id]) || 0 }));
      const saveRes = await fetch(`/api/medium-orders/${orderId}/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
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

  const undoHandover = async (day: OrderDay) => {
    setSavingDayId(day.id);
    try {
      const res = await fetch(`/api/medium-orders/${orderId}/days/${day.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undoHandover" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã hoàn lại — có thể nhập/sửa lại số liệu");
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

  const saveSurplus = async (itemId: string) => {
    setSavingSurplusItemId(itemId);
    try {
      const surplusQuantity = Number(surplusDrafts[itemId]) || 0;
      const res = await fetch(`/api/medium-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recordSurplus", itemId, surplusQuantity }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã lưu số dư thực tế");
      load();
    } finally {
      setSavingSurplusItemId(null);
    }
  };

  const finishSurplusEntry = async () => {
    setFinishingSurplus(true);
    try {
      const res = await fetch(`/api/medium-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finishSurplusEntry" }),
      });
      if (!res.ok) { toast.error((await res.json()).message ?? "Có lỗi xảy ra"); return; }
      toast.success("Đã hoàn thành kiểm tra môi trường dư");
      load();
    } finally {
      setFinishingSurplus(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  if (!order) return <p className="text-sm text-text-muted text-center py-12">Không tìm thấy đơn</p>;

  const executionWeek = getExecutionWeek(new Date(order.weekStart));

  // Kho mô chỉ nhập được môi trường dư cho đúng đơn "đang thực hiện" (đã xác nhận, chưa kết thúc), vào
  // Thứ 2 hoặc Thứ 3, và chỉ khi CHƯA bấm "Hoàn thành" — khớp check server-side ở PATCH
  // /api/medium-orders/[id] (action=recordSurplus/finishSurplusEntry).
  const canRecordSurplus = isKhoMo && isMediumSurplusEntryDay() && isMediumOrderInProgress(order) && !order.surplusRecordedAt;

  const totals = order.days.reduce(
    (acc, d) => ({ m05: acc.m05 + d.m05, t01: acc.t01 + d.t01, t05: acc.t05 + d.t05 }),
    { m05: 0, t01: 0, t05: 0 }
  );
  // Tổng đã bàn giao trong tuần (Bảng pha theo ngày) theo đúng quy cách — dùng tính "số dư lý thuyết".
  const handedOverByStage: Record<string, number> = { M05: totals.m05, T01: totals.t01, T05: totals.t05 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/medium-orders"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground font-mono">{order.code}</h1>
            {order.endedAt && <Badge className="bg-danger-light text-destructive">Đã kết thúc sớm</Badge>}
          </div>
          <p className="text-text-secondary text-sm">
            Tuần thực hiện: {format(executionWeek.start, "dd/MM", { locale: vi })} – {format(executionWeek.end, "dd/MM/yyyy", { locale: vi })}
          </p>
        </div>
        {isMoiTruong && isMediumOrderInProgress(order) && (
          <EndMediumOrderEarlyButton orderId={order.id} orderCode={order.code} onEnded={load} />
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-primary-strong">Quy cách cần pha</CardTitle>
            {isKhoMo && !canRecordSurplus && (
              <p className="text-xs text-text-muted mt-1">
                {order.surplusRecordedAt
                  ? "Đã hoàn thành kiểm tra môi trường dư tuần này."
                  : isMediumSurplusEntryDay()
                    ? "Đơn chưa được NV môi trường xác nhận hoặc đã kết thúc — chưa kiểm tra được môi trường dư."
                    : "Chỉ kiểm tra được môi trường dư vào Thứ 2 hoặc Thứ 3."}
              </p>
            )}
            {isKhoMo && canRecordSurplus && (
              <p className="text-xs text-text-muted mt-1">
                Đối chiếu &quot;Dư lý thuyết&quot; (đã bàn giao − đã sử dụng) với số đếm thực tế, rồi điền vào ô &quot;Số dư thực tế&quot;.
              </p>
            )}
          </div>
          {canRecordSurplus && (
            <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover shrink-0" disabled={finishingSurplus} onClick={finishSurplusEntry}>
              {finishingSurplus ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
              {!finishingSurplus && "Hoàn thành kiểm tra môi trường dư"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Quy cách</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Mã môi trường</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">SL cần (cây/cụm)</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Số túi cần</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Đã bàn giao (túi)</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Đã sử dụng (túi)</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Dư lý thuyết (túi)</th>
                  <th className="text-left px-4 py-2 text-primary-strong font-bold text-base">Số dư thực tế</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => {
                  const grossBags = quantityToBags(item.stageCode, item.quantity);
                  const netBags = netBagsNeeded(item.stageCode, item.quantity, item.surplusQuantity);
                  const handedOverBags = quantityToBags(item.stageCode, handedOverByStage[item.stageCode] ?? 0);
                  const usedBags = quantityToBags(item.stageCode, order.actualProductionByStage[item.stageCode] ?? 0);
                  const theoreticalBags = handedOverBags - usedBags;
                  return (
                    <tr key={item.id} className="border-b last:border-0 even:bg-primary-light">
                      <td className="px-4 py-2"><Badge variant="outline">{item.stageCode}</Badge></td>
                      <td className="px-4 py-2 font-mono text-secondary-foreground">{item.mediumType.code}</td>
                      <td className="px-4 py-2 text-left font-medium">{item.quantity.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-left font-medium text-primary-strong">
                        {netBags.toLocaleString("vi-VN")} túi
                        {item.surplusQuantity > 0 && (
                          <span className="block text-xs text-text-muted font-normal">
                            ({grossBags.toLocaleString("vi-VN")} − {item.surplusQuantity.toLocaleString("vi-VN")} dư)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-left">{handedOverBags.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-left">{usedBags.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2 text-left font-medium text-info-foreground">{theoreticalBags.toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-2">
                        {canRecordSurplus ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="number" min={0}
                              className="w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={surplusDrafts[item.id] ?? "0"}
                              onChange={(e) => setSurplusDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            />
                            <Button
                              size="sm" variant="outline" className="h-8"
                              disabled={savingSurplusItemId === item.id}
                              onClick={() => saveSurplus(item.id)}
                            >
                              {savingSurplusItemId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Lưu"}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-text-secondary">{item.surplusQuantity.toLocaleString("vi-VN")} túi</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-bold text-primary-strong">Bảng pha theo ngày</CardTitle>
          <p className="text-xs text-text-muted">
            Bắt đầu pha từ Thứ 6 tuần trước (ngay khi đơn được gửi) tới hết Thứ 6 của tuần thực hiện —
            8 ngày, không chỉ gói gọn trong &quot;Tuần thực hiện&quot; ở trên.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light text-primary-strong">
                  <th className="px-3 py-2 text-left whitespace-nowrap font-bold text-base">Ngày</th>
                  {order.items.map((item) => (
                    <th key={item.id} className="px-3 py-2 text-center whitespace-nowrap font-bold text-base">
                      {item.stageCode} · {item.mediumType.code}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-bold text-base">Bàn giao</th>
                  <th className="px-3 py-2 text-left font-bold text-base">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {order.days.map((day) => {
                  const status = dayStatus(day);
                  const isToday = isSameVnCalendarDay(new Date(day.date), new Date());
                  const editable = isMoiTruong && !day.handedOverAt && isToday;
                  // Hoàn lại (mở khoá sửa lại) — chỉ khi đã bàn giao nhưng Kho mô CHƯA xác nhận nhận.
                  // NV môi trường chỉ tự hoàn lại được đúng ngày hôm nay (hoàn ngày khác cũng không sửa
                  // lại được vì editable còn đòi hỏi isToday) — Kho mô/Admin hoàn lại được mọi ngày.
                  const canUndo = !!day.handedOverAt && !day.confirmedAt && ((isMoiTruong && isToday) || isKhoMo || isAdminRole(role));
                  const draft = drafts[day.id];
                  // Ngày đã khoá (bàn giao) TRƯỚC khi tính năng chi tiết theo loại lên — chỉ có tổng
                  // m05/t01/t05 cũ, không có dayItems — hiện gộp 1 ô thay vì toàn số 0 gây hiểu nhầm mất
                  // dữ liệu.
                  const isLegacyDay = !editable && day.dayItems.length === 0 && (day.m05 > 0 || day.t01 > 0 || day.t05 > 0);
                  return (
                    <tr key={day.id} className="border-b last:border-0 even:bg-primary-light">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        {format(new Date(day.date), "EEEE, dd/MM", { locale: vi })}
                      </td>
                      {isLegacyDay ? (
                        <td className="px-3 py-2 text-center text-text-muted text-xs" colSpan={order.items.length}>
                          Đã bàn giao (số liệu cũ, chưa tách theo loại): M05 {day.m05.toLocaleString("vi-VN")} · T01{" "}
                          {day.t01.toLocaleString("vi-VN")} · T05 {day.t05.toLocaleString("vi-VN")}
                        </td>
                      ) : (
                        order.items.map((item) => (
                          <td key={item.id} className="px-2 py-2">
                            {editable ? (
                              <Input
                                type="number" min={0}
                                className={NUMBER_INPUT_CLASS}
                                value={draft?.[item.id] ?? "0"}
                                onChange={(e) => setDraftField(day.id, item.id, e.target.value)}
                              />
                            ) : (
                              <p className="text-center text-foreground">
                                {(day.dayItems.find((di) => di.itemId === item.id)?.quantity ?? 0).toLocaleString("vi-VN")}
                              </p>
                            )}
                          </td>
                        ))
                      )}
                      <td className="px-3 py-2 text-center">
                        {editable && (
                          <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover" disabled={savingDayId === day.id} onClick={() => handover(day)}>
                            {savingDayId === day.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                            {savingDayId !== day.id && "Bàn giao"}
                          </Button>
                        )}
                        {isKhoMo && day.handedOverAt && !day.confirmedAt && (
                          <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover mr-1.5" disabled={savingDayId === day.id} onClick={() => confirmDay(day)}>
                            {savingDayId === day.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1.5" />}
                            {savingDayId !== day.id && "Xác nhận"}
                          </Button>
                        )}
                        {canUndo && (
                          <Button size="sm" variant="outline" className="h-8" disabled={savingDayId === day.id} onClick={() => undoHandover(day)}>
                            {savingDayId === day.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                            {savingDayId !== day.id && "Hoàn lại"}
                          </Button>
                        )}
                      </td>
                      <td className="px-3 py-2"><Badge className={status.color}>{status.label}</Badge></td>
                    </tr>
                  );
                })}
                <tr className="border-b bg-info-light font-semibold">
                  <td className="px-3 py-2">Tổng cộng</td>
                  {order.items.map((item) => {
                    const itemTotal = order.days.reduce((sum, d) => sum + (d.dayItems.find((di) => di.itemId === item.id)?.quantity ?? 0), 0);
                    return (
                      <td key={item.id} className="px-3 py-2 text-center">
                        {itemTotal.toLocaleString("vi-VN")}
                      </td>
                    );
                  })}
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
