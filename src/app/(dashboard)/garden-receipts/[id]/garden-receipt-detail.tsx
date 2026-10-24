"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, UserCheck, ClipboardCheck, ShieldCheck, TriangleAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { GARDEN_RECEIPT_STATUS_LABELS, GARDEN_ORDER_TYPE_LABELS, GARDEN_OUTPUT_SPEC_LABELS } from "@/lib/garden-receipt-constants";

type Status = keyof typeof GARDEN_RECEIPT_STATUS_LABELS;
type Item = {
  id: string; stageCode: string; quantity: number; firstReceivedQuantity: number | null; receivedQuantity: number | null; plantType: { code: string; name: string };
  outputs: { stageCode: string; quantity: number }[];
};
const outputLabel = (code: string) => (GARDEN_OUTPUT_SPEC_LABELS as Record<string, string>)[code] ?? code;
type Receipt = {
  id: string; code: string; status: Status; notes: string | null; createdAt: string; countRound: number;
  orderType: keyof typeof GARDEN_ORDER_TYPE_LABELS; expectedDeliveryDate: string | null; orderNotes: string | null; saleUser: { name: string; code: string } | null;
  countedAt: string | null; approvedAt: string | null; completedAt: string | null; assignedAt: string | null; assigneeName: string | null;
  garden: { name: string }; fromWarehouse: { name: string }; fromRoom: { name: string } | null;
  createdBy: { name: string }; countedBy: { name: string } | null; approvedBy: { name: string } | null;
  items: Item[];
};

const STATUS_BADGE: Record<Status, "info" | "in-progress" | "overdue" | "completed"> = {
  PENDING: "info", COUNTING: "in-progress", DISCREPANCY: "overdue", COMPLETED: "completed",
};
const fmt = (n: number) => n.toLocaleString("vi-VN");
const dt = (s: string | null) => (s ? format(new Date(s), "dd/MM/yyyy HH:mm") : "");

export default function GardenReceiptDetail({ receipt, canManage, canApprove, sorters }: {
  receipt: Receipt; canManage: boolean; canApprove: boolean; sorters: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState<string>("SELF");
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(receipt.items.map((i) => [i.id, receipt.status === "COUNTING" ? "" : i.receivedQuantity?.toString() ?? ""]))
  );
  const [confirm, setConfirm] = useState<"count" | "approve" | null>(null);

  const isCounting = receipt.status === "COUNTING";
  const canAssign = canManage && (receipt.status === "PENDING" || receipt.status === "DISCREPANCY" || receipt.status === "COUNTING");
  const showReceived = receipt.items.some((i) => i.receivedQuantity !== null) || isCounting;
  const totalSent = receipt.items.reduce((s, i) => s + i.quantity, 0);

  const call = async (body: object) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/garden-receipts/${receipt.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return false; }
      if (json.discrepancy) toast.warning(json.message); else toast.success(json.message);
      router.refresh();
      return true;
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const validateCount = () => {
    for (const it of receipt.items) {
      const v = received[it.id];
      if (v === "" || v === undefined || !Number.isInteger(Number(v)) || Number(v) < 0) {
        toast.error(`${it.plantType.code} ${it.stageCode}: nhập số thực nhận`);
        return false;
      }
    }
    return true;
  };
  const diffOf = (it: Item, value: number | null) => (value === null ? null : value - it.quantity);
  const pendingDiffCount = receipt.items.filter((it) => received[it.id] !== "" && Number(received[it.id]) !== it.quantity).length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/garden-receipts"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Phiếu bàn giao <span className="font-mono">{receipt.code}</span></h1>
            <p className="text-text-secondary text-sm">
              {receipt.fromWarehouse.name}{receipt.fromRoom ? ` · ${receipt.fromRoom.name}` : " · Phòng ra rễ"} → {receipt.garden.name}
            </p>
          </div>
        </div>
        <Badge variant={STATUS_BADGE[receipt.status]}>{GARDEN_RECEIPT_STATUS_LABELS[receipt.status]}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{GARDEN_ORDER_TYPE_LABELS[receipt.orderType]}</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 text-sm">
          {receipt.orderType === "PLANNED" ? (
            <>
              <p><span className="text-text-secondary">NV bán hàng đặt hàng:</span> {receipt.saleUser ? `${receipt.saleUser.name} (${receipt.saleUser.code})` : "—"}</p>
              <p><span className="text-text-secondary">Ngày giao dự kiến:</span> {receipt.expectedDeliveryDate ? format(new Date(receipt.expectedDeliveryDate), "dd/MM/yyyy") : "—"}</p>
            </>
          ) : (
            <p className="sm:col-span-2"><span className="text-text-secondary">Đầu ra:</span> {outputLabel("B")} cho toàn bộ số cây</p>
          )}
          {receipt.orderNotes && <p className="sm:col-span-2"><span className="text-text-secondary">Ghi chú lệnh:</span> {receipt.orderNotes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 grid gap-2 sm:grid-cols-2 text-sm">
          <p><span className="text-text-secondary">Lập phiếu:</span> {receipt.createdBy.name} · {dt(receipt.createdAt)}</p>
          <p><span className="text-text-secondary">Người kiểm đếm:</span> {receipt.assigneeName ? `${receipt.assigneeName} · giao ${dt(receipt.assignedAt)}` : "Chưa giao"}</p>
          {receipt.countedBy && <p><span className="text-text-secondary">Nhập số:</span> {receipt.countedBy.name} · {dt(receipt.countedAt)} {receipt.countRound > 1 && `(lần ${receipt.countRound})`}</p>}
          {receipt.approvedBy && <p><span className="text-text-secondary">Admin cấp cao duyệt số lệch:</span> {receipt.approvedBy.name} · {dt(receipt.approvedAt)}</p>}
          {receipt.notes && <p className="sm:col-span-2"><span className="text-text-secondary">Ghi chú:</span> {receipt.notes}</p>}
        </CardContent>
      </Card>

      {receipt.status === "DISCREPANCY" && (
        <p className="text-sm text-destructive bg-danger-light rounded-lg p-3 flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          Số thực nhận lệch với số bàn giao — đã báo bên giao và Admin cấp cao. Quản lý vườn có thể giao kiểm tra lại để cập nhật số; Admin cấp cao có thể duyệt số lệch để ghi nhận số thực nhận vào tồn vườn.
        </p>
      )}

      {canAssign && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserCheck className="w-4 h-4" /> {receipt.status === "DISCREPANCY" ? "Giao kiểm tra lại" : isCounting ? "Đổi người kiểm đếm" : "Giao kiểm đếm"}</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 w-full sm:w-72">
              <Label>Người kiểm đếm</Label>
              <Select
                items={[{ value: "SELF", label: "Chính tôi (Quản lý vườn)" }, ...sorters.map((s) => ({ value: s.id, label: `${s.name} — NV phân loại` }))]}
                value={assignee}
                onValueChange={(v) => setAssignee(v as string)}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SELF">Chính tôi (Quản lý vườn)</SelectItem>
                  {sorters.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — NV phân loại</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => call({ action: "assign", assignee })}>
              {receipt.status === "DISCREPANCY" ? <RefreshCw className="w-4 h-4 mr-1.5" /> : <UserCheck className="w-4 h-4 mr-1.5" />}
              {receipt.status === "DISCREPANCY" ? "Giao kiểm tra lại" : "Giao việc"}
            </Button>
            {sorters.length === 0 && <p className="text-xs text-text-muted w-full">Vườn chưa có Nhân viên phân loại — thêm ở mục Nhân sự vườn.</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Chi tiết ({receipt.items.length} dòng · {fmt(totalSent)} cây bàn giao)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã cây</th>
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                  <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Bàn giao</th>
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Quy cách đầu ra</th>
                  {showReceived && <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Thực nhận</th>}
                  {showReceived && <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Chênh lệch</th>}
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((it) => {
                  const value = isCounting ? (received[it.id] === "" ? null : Number(received[it.id])) : it.receivedQuantity;
                  const diff = diffOf(it, value);
                  return (
                    <tr key={it.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-2"><span className="font-mono text-text-secondary mr-1.5">{it.plantType.code}</span>{it.plantType.name}</td>
                      <td className="px-4 py-2">{it.stageCode}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(it.quantity)}</td>
                      <td className="px-4 py-2 text-xs text-text-secondary">
                        {it.outputs.length === 0 ? "—" : it.outputs.map((o) => <p key={o.stageCode}>{outputLabel(o.stageCode)}: <span className="font-medium text-foreground">{fmt(o.quantity)}</span></p>)}
                      </td>
                      {showReceived && (
                        <td className="px-4 py-2 text-right">
                          {isCounting && canManage ? (
                            <Input type="number" min={0} className="h-8 w-28 ml-auto text-right" value={received[it.id] ?? ""}
                              onChange={(e) => setReceived((p) => ({ ...p, [it.id]: e.target.value }))} />
                          ) : (
                            <span className="tabular-nums">
                              {it.receivedQuantity === null ? "—" : fmt(it.receivedQuantity)}
                              {it.firstReceivedQuantity !== null && it.firstReceivedQuantity !== it.receivedQuantity && (
                                <span className="block text-xs text-text-muted">lần đầu: {fmt(it.firstReceivedQuantity)}</span>
                              )}
                            </span>
                          )}
                        </td>
                      )}
                      {showReceived && (
                        <td className={`px-4 py-2 text-right tabular-nums font-medium ${diff === null ? "" : diff === 0 ? "text-success-foreground" : "text-destructive"}`}>
                          {diff === null ? "—" : diff === 0 ? "0" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isCounting && canManage && (
        <Button className="w-full" disabled={busy} onClick={() => { if (validateCount()) setConfirm("count"); }}>
          <ClipboardCheck className="w-4 h-4 mr-2" /> Xác nhận số thực nhận
        </Button>
      )}
      {receipt.status === "DISCREPANCY" && canApprove && (
        <Button className="w-full" variant="outline" disabled={busy} onClick={() => setConfirm("approve")}>
          <ShieldCheck className="w-4 h-4 mr-2" /> Duyệt số lệch (ghi nhận số thực nhận vào tồn vườn)
        </Button>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirm === "approve" ? "Duyệt số lệch?" : "Xác nhận số thực nhận?"}</DialogTitle></DialogHeader>
          <p className="text-sm text-foreground">
            {confirm === "approve"
              ? "Số thực nhận của vườn sẽ được cộng vào tồn vườn, phiếu chuyển Đã nhận."
              : pendingDiffCount > 0
                ? `Có ${pendingDiffCount} dòng lệch — phiếu chuyển Lệch số lượng, hệ thống báo bên giao và Admin cấp cao kiểm tra lại.`
                : "Số khớp với số bàn giao — cộng vào tồn kho vườn."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Huỷ</Button>
            <Button disabled={busy} onClick={() => confirm === "approve"
              ? call({ action: "approve" })
              : call({ action: "count", items: receipt.items.map((i) => ({ itemId: i.id, receivedQuantity: Number(received[i.id]) })) })}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
