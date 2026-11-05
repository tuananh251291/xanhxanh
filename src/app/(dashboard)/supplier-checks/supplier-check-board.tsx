"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import SupplierCheckQuantityForm from "@/components/shared/supplier-check-quantity-form";

type Line = { plantTypeId: string; stageCode: string; code: string; name: string; fromStock: number; shortage: number; pending: number; confirmed: number; left: number };
type Check = {
  id: string; code: string; status: string; supplierName: string; hasAccount: boolean; deliveryKey: string; responseDeadline: string;
  items: { id: string; label: string; requested: number; confirmed: number | null; delivered: number | null }[];
};
export type BoardOrder = {
  id: string; code: string; status: string; customerCode: string; saleName: string; shipKey: string | null; latestDeliveryKey: string | null;
  holdUntil: string | null; resultSent: boolean; lines: Line[]; checks: Check[];
};

const STATUS: Record<string, { label: string; variant: "in-progress" | "completed" | "overdue" | "info" | "outline" }> = {
  PENDING: { label: "Chờ NCC trả lời", variant: "in-progress" },
  CONFIRMED: { label: "NCC có thể đáp ứng", variant: "info" },
  DECLINED: { label: "NCC không đáp ứng", variant: "overdue" },
  EXPIRED: { label: "NCC quá hạn", variant: "overdue" },
  PLACED: { label: "Đã đặt hàng", variant: "completed" },
  DELIVERED: { label: "NCC đã giao", variant: "completed" },
  CANCELLED: { label: "Đã huỷ", variant: "outline" },
};

const fmt = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (key: string | null) => (key ? key.split("-").reverse().join("/") : "—");

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (url: string, method: "POST" | "PATCH", body: unknown, success: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) { toast.error(json?.message ?? "Có lỗi xảy ra"); return false; }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function SendForm({ order, suppliers }: { order: BoardOrder; suppliers: { id: string; label: string }[] }) {
  const { busy, run } = useAction();
  const open = order.lines.filter((l) => l.left > 0);
  const [supplierId, setSupplierId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(order.latestDeliveryKey ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(open.map((l) => [`${l.plantTypeId}:${l.stageCode}`, String(l.left)])));

  const submit = async () => {
    if (!supplierId) { toast.error("Chọn nhà cung cấp"); return; }
    if (!deliveryDate) { toast.error("Chọn ngày giao"); return; }
    const items = open.map((l) => ({ plantTypeId: l.plantTypeId, stageCode: l.stageCode, quantity: Number(quantities[`${l.plantTypeId}:${l.stageCode}`]) }));
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 0)) { toast.error("Số lượng phải là số nguyên không âm"); return; }
    await run("/api/supplier-checks", "POST", { action: "create", orderId: order.id, supplierId, deliveryDate, items }, "Đã gửi Đơn kiểm tra cho NCC");
  };

  return (
    <div className="space-y-3 rounded-lg border border-divider p-3">
      <p className="text-sm font-semibold text-foreground">Gửi NCC kiểm tra phần còn thiếu</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm font-medium text-foreground">
          <span className="block">Nhà cung cấp</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-sm max-w-xs">
            <option value="">Chọn NCC</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium text-foreground">
          <span className="block">Ngày giao (muộn nhất {fmtDate(order.latestDeliveryKey)})</span>
          <Input type="date" value={deliveryDate} max={order.latestDeliveryKey ?? undefined} onChange={(e) => setDeliveryDate(e.target.value)} className="w-44" />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {open.map((l) => {
          const key = `${l.plantTypeId}:${l.stageCode}`;
          return (
            <label key={key} className="space-y-1 text-sm font-medium text-foreground">
              <span className="block">{l.code} {l.stageCode}</span>
              <Input type="number" min={0} max={l.left} value={quantities[key] ?? ""} onChange={(e) => setQuantities((p) => ({ ...p, [key]: e.target.value }))} className="w-28" />
            </label>
          );
        })}
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={submit}>
        {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Gửi Đơn kiểm tra
      </Button>
    </div>
  );
}

function CheckCard({ check, orderDeposited }: { check: Check; orderDeposited: boolean }) {
  const { busy, run } = useAction();
  const status = STATUS[check.status] ?? { label: check.status, variant: "outline" as const };
  const endpoint = `/api/supplier-checks/${check.id}`;
  return (
    <div className="space-y-2 rounded-lg border border-divider p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono text-xs">{check.code}</span>
        <span className="font-medium text-foreground">{check.supplierName}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
        <span className="text-text-secondary">Giao {fmtDate(check.deliveryKey)}</span>
        {check.status === "PENDING" && <span className="text-text-secondary">Hạn trả lời {new Date(check.responseDeadline).toLocaleString("vi-VN")}</span>}
      </div>
      {check.status === "PENDING" && !check.hasAccount ? (
        <SupplierCheckQuantityForm
          endpoint={endpoint}
          action="respond"
          columnLabel="NCC đáp ứng"
          submitLabel="Lưu kết quả NCC"
          lines={check.items.map((i) => ({ id: i.id, label: i.label, quantity: i.requested }))}
        />
      ) : check.status === "PLACED" && !check.hasAccount ? (
        <SupplierCheckQuantityForm
          endpoint={endpoint}
          action="deliver"
          columnLabel="Thực giao"
          submitLabel="Lưu phiếu giao"
          lines={check.items.filter((i) => (i.confirmed ?? 0) > 0).map((i) => ({ id: i.id, label: i.label, quantity: i.confirmed ?? 0 }))}
        />
      ) : (
        <p className="text-sm text-text-secondary">
          {check.items.map((i) => `${i.label}: yêu cầu ${fmt(i.requested)}${i.confirmed !== null ? `, đáp ứng ${fmt(i.confirmed)}` : ""}${i.delivered !== null ? `, thực giao ${fmt(i.delivered)}` : ""}`).join(" · ")}
        </p>
      )}
      {check.status === "CONFIRMED" && orderDeposited && (
        <Button type="button" size="sm" disabled={busy} onClick={() => run(endpoint, "PATCH", { action: "place" }, "Đã đặt hàng NCC")}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />} Đặt hàng
        </Button>
      )}
    </div>
  );
}

function OrderCard({ order, suppliers }: { order: BoardOrder; suppliers: { id: string; label: string }[] }) {
  const { busy, run } = useAction();
  const hasPending = order.checks.some((c) => c.status === "PENDING");
  const canSend = order.status === "HELD" && !order.resultSent;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {order.code}
          <Badge variant={order.status === "CONFIRMED" ? "completed" : "in-progress"}>{order.status === "CONFIRMED" ? "Khách đã cọc" : order.resultSent ? "Chờ khách cọc" : "Đang kiểm tra"}</Badge>
        </CardTitle>
        <p className="text-sm text-text-secondary">
          {order.customerCode} · {order.saleName} · Xuất {fmtDate(order.shipKey)}
          {order.resultSent && order.holdUntil && order.status === "HELD" ? ` · Giữ đến ${new Date(order.holdUntil).toLocaleString("vi-VN")}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Cây</th>
                <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Đặt</th>
                <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Đáp ứng</th>
                <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Thiếu</th>
                <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">NCC đáp ứng</th>
                <th className="text-right px-3 py-2 text-base text-primary-strong font-bold">Còn thiếu</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l) => (
                <tr key={`${l.plantTypeId}:${l.stageCode}`} className="border-b border-divider">
                  <td className="px-3 py-2"><span className="font-mono text-xs">{l.code}</span> {l.name} · {l.stageCode}</td>
                  <td className="px-3 py-2 text-right">{fmt(l.fromStock + l.shortage)}</td>
                  <td className="px-3 py-2 text-right">{fmt(l.fromStock)}</td>
                  <td className="px-3 py-2 text-right">{fmt(l.shortage)}</td>
                  <td className="px-3 py-2 text-right">{fmt(l.confirmed)}{l.pending > 0 ? ` (chờ ${fmt(l.pending)})` : ""}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${l.left > 0 ? "text-destructive" : ""}`}>{fmt(l.left)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {order.checks.map((c) => <CheckCard key={c.id} check={c} orderDeposited={order.status === "CONFIRMED"} />)}
        {canSend && order.lines.some((l) => l.left > 0) && <SendForm order={order} suppliers={suppliers} />}
        {canSend && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || hasPending}
            title={hasPending ? "Còn NCC chưa trả lời" : undefined}
            onClick={() => run("/api/supplier-checks", "POST", { action: "send-result", orderId: order.id }, "Đã gửi kết quả cho NV bán hàng")}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1.5" />} Gửi kết quả cho NV bán hàng
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function SupplierCheckBoard({ orders, suppliers }: { orders: BoardOrder[]; suppliers: { id: string; label: string }[] }) {
  if (orders.length === 0) {
    return <Card><CardContent className="py-12 text-center text-text-muted">Không có đơn hàng nào đang thiếu</CardContent></Card>;
  }
  return <div className="space-y-4">{orders.map((o) => <OrderCard key={o.id} order={o} suppliers={suppliers} />)}</div>;
}
