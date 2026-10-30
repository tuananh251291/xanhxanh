"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Save, Send, CheckCircle2, Undo2, TriangleAlert, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  GARDEN_CARE_TICKET_LABELS, GARDEN_DAMAGE_STATUS_LABELS, GARDEN_STOCK_POOL_LABELS, GARDEN_SIZE_S_LABEL,
} from "@/lib/garden-receipt-constants";

type Status = keyof typeof GARDEN_DAMAGE_STATUS_LABELS;
type Item = { id: string; reportedQuantity: number; confirmedQuantity: number | null; notes: string | null; rowLabel: string; fromRowLabel: string | null; available: number };
type Ticket = {
  id: string; code: string; type: keyof typeof GARDEN_CARE_TICKET_LABELS; status: Status; notes: string | null; returnReason: string | null;
  createdAt: string; submittedAt: string | null; confirmedAt: string | null;
  garden: { name: string }; staff: { name: string } | null; createdBy: { name: string }; confirmedBy: { name: string } | null;
  lot: { code: string; pool: keyof typeof GARDEN_STOCK_POOL_LABELS; stageCode: string; initialQuantity: number; plantType: { code: string; name: string }; receiptItem: { receipt: { id: string; code: string } } };
  items: Item[];
  logs: { id: string; action: string; detail: string; at: string; by: { name: string } }[];
};

const STATUS_BADGE: Record<Status, "info" | "in-progress" | "overdue" | "completed"> = {
  DRAFT: "info", SUBMITTED: "in-progress", RETURNED: "overdue", CONFIRMED: "completed",
};
const LOG_LABELS: Record<string, string> = { SUBMIT: "NV gửi QLV", RETURN: "QLV trả lại", CONFIRM: "QLV duyệt" };
const fmt = (n: number) => n.toLocaleString("vi-VN");
const dt = (s: string | null) => (s ? format(new Date(s), "dd/MM/yyyy HH:mm") : "");

export default function GardenCareTicketDetail({ ticket, canEdit, canReview }: { ticket: Ticket; canEdit: boolean; canReview: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(ticket.items.map((i) => [i.id, String(i.reportedQuantity)])));
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(Object.fromEntries(ticket.items.map((i) => [i.id, i.notes ?? ""])));
  const [notes, setNotes] = useState(ticket.notes ?? "");
  const [confirm, setConfirm] = useState<"submit" | "confirm" | "return" | null>(null);
  const [reason, setReason] = useState("");

  const isPlace = ticket.type === "PLACE";
  const isSize = ticket.type === "SIZE_S";
  const editable = canEdit || canReview;
  const pool = GARDEN_STOCK_POOL_LABELS[ticket.lot.pool];
  const total = ticket.items.reduce((s, i) => s + (Number(qty[i.id]) || 0), 0);

  const validate = () => {
    for (const it of ticket.items) {
      const v = Number(qty[it.id]);
      if (qty[it.id] === "" || !Number.isInteger(v) || v < 0) { toast.error(`Dãy ${it.rowLabel}: nhập số lượng (0 nếu không có)`); return false; }
      if (v > it.available) { toast.error(`Dãy ${it.rowLabel}: vượt số cây của lô ở dãy (${fmt(it.available)})`); return false; }
    }
    return true;
  };
  const itemsPayload = () => ticket.items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]), notes: itemNotes[i.id]?.trim() || undefined }));

  const call = async (body: object) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/garden-care/tickets/${ticket.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/garden-care"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{GARDEN_CARE_TICKET_LABELS[ticket.type]}</h1>
            <p className="text-text-secondary text-sm"><span className="font-mono">{ticket.code}</span> · {ticket.garden.name}</p>
          </div>
        </div>
        <Badge variant={STATUS_BADGE[ticket.status]}>{isPlace ? "Đã duyệt" : GARDEN_DAMAGE_STATUS_LABELS[ticket.status]}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-2 sm:grid-cols-2 text-sm">
          <p><span className="text-text-secondary">Mã lô:</span> <span className="font-mono">{ticket.lot.code}</span> (phiếu bàn giao <Link href={`/garden-receipts/${ticket.lot.receiptItem.receipt.id}`} className="font-mono underline underline-offset-2">{ticket.lot.receiptItem.receipt.code}</Link>)</p>
          <p><span className="text-text-secondary">Mã cây:</span> {ticket.lot.plantType.code} — {ticket.lot.plantType.name} ({ticket.lot.stageCode})</p>
          <p><span className="text-text-secondary">Kho ban đầu:</span> {pool} · lô ban đầu {fmt(ticket.lot.initialQuantity)} cây</p>
          {isSize && <p><span className="text-text-secondary">Quy cách đạt:</span> {GARDEN_SIZE_S_LABEL} → Kho thành phẩm vườn</p>}
          <p><span className="text-text-secondary">NV phụ trách:</span> {ticket.staff?.name ?? "—"}</p>
          <p><span className="text-text-secondary">Người lập:</span> {ticket.createdBy.name} · {dt(ticket.createdAt)}</p>
          {ticket.submittedAt && !isPlace && <p><span className="text-text-secondary">Gửi QLV:</span> {dt(ticket.submittedAt)}</p>}
          {ticket.confirmedBy && <p><span className="text-text-secondary">Người duyệt:</span> {ticket.confirmedBy.name} · {dt(ticket.confirmedAt)}</p>}
        </CardContent>
      </Card>

      {ticket.status === "RETURNED" && ticket.returnReason && (
        <p className="text-sm text-destructive bg-danger-light rounded-lg p-3 flex items-start gap-2"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /> QLV trả lại: {ticket.returnReason}</p>
      )}
      {canReview && (
        <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3">
          Kiểm tra số NV báo — sửa nếu chưa đúng rồi Duyệt (lưu cả số NV báo và số QLV sửa), hoặc Trả lại để NV kiểm tra, gửi lại.{" "}
          {isSize ? `Duyệt: trừ ${pool} + giàn/kệ, cộng Kho thành phẩm vườn (quy cách S).` : `Duyệt: trừ cùng số khỏi ${pool} và giàn/kệ.`}
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{isPlace ? "Sắp xếp / điều chuyển" : `Theo dãy — tổng ${fmt(total)} cây`}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  {isPlace && <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Từ</th>}
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">{isPlace ? "Đến dãy" : "Giàn/kệ"}</th>
                  {!isPlace && <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Cây của lô ở dãy</th>}
                  {!isPlace && ticket.status !== "DRAFT" && <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">NV báo</th>}
                  <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">{isPlace ? "Số cây" : isSize ? "Số cây đạt size S" : "Số cây hỏng"}</th>
                  {!isPlace && <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Ghi chú</th>}
                </tr>
              </thead>
              <tbody>
                {ticket.items.map((it) => {
                  const final = ticket.status === "CONFIRMED" ? it.confirmedQuantity ?? 0 : null;
                  return (
                    <tr key={it.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                      {isPlace && <td className="px-4 py-2 font-mono">{it.fromRowLabel ?? "Chưa xếp"}</td>}
                      <td className="px-4 py-2 font-mono">{it.rowLabel}</td>
                      {!isPlace && <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{fmt(it.available)}</td>}
                      {!isPlace && ticket.status !== "DRAFT" && <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{fmt(it.reportedQuantity)}</td>}
                      <td className="px-4 py-2 text-right">
                        {editable ? (
                          <Input type="number" min={0} max={it.available} className="h-8 w-24 ml-auto text-right" value={qty[it.id] ?? ""}
                            onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))} />
                        ) : (
                          <span className="tabular-nums font-medium">
                            {fmt(final ?? it.reportedQuantity)}
                            {final !== null && final !== it.reportedQuantity && !isPlace && <span className="block text-xs text-text-muted font-normal">QLV sửa từ {fmt(it.reportedQuantity)}</span>}
                          </span>
                        )}
                      </td>
                      {!isPlace && (
                        <td className="px-4 py-2">
                          {canEdit ? (
                            <Input className="h-8 w-48" maxLength={300} value={itemNotes[it.id] ?? ""} onChange={(e) => setItemNotes((p) => ({ ...p, [it.id]: e.target.value }))} />
                          ) : <span className="text-text-secondary">{it.notes || "—"}</span>}
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

      {canEdit && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Ghi chú phiếu <span className="text-text-muted font-normal">(tuỳ chọn)</span></Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => { if (validate()) call({ action: "save", items: itemsPayload(), notes: notes.trim() || undefined }); }}>
              <Save className="w-4 h-4 mr-1.5" /> Lưu nháp
            </Button>
            <Button disabled={busy} onClick={() => { if (validate()) setConfirm("submit"); }}><Send className="w-4 h-4 mr-1.5" /> Gửi QLV duyệt</Button>
          </div>
        </div>
      )}
      {!canEdit && ticket.notes && <p className="text-sm"><span className="text-text-secondary">Ghi chú phiếu:</span> {ticket.notes}</p>}

      {canReview && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => { if (validate()) setConfirm("confirm"); }}><CheckCircle2 className="w-4 h-4 mr-1.5" /> Duyệt</Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirm("return")}><Undo2 className="w-4 h-4 mr-1.5" /> Trả lại kiểm tra lại</Button>
        </div>
      )}

      {ticket.logs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Lịch sử xử lý</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ticket.logs.map((l) => (
              <p key={l.id}><span className="text-text-secondary">{dt(l.at)}</span> · <strong>{LOG_LABELS[l.action] ?? l.action}</strong> ({l.by.name}) — {l.detail}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{confirm === "submit" ? "Gửi phiếu cho QLV?" : confirm === "confirm" ? "Duyệt phiếu?" : "Trả lại phiếu?"}</DialogTitle></DialogHeader>
          {confirm === "return" ? (
            <div className="space-y-1">
              <Label>Lý do trả lại</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </div>
          ) : (
            <p className="text-sm text-foreground">
              {confirm === "submit"
                ? `Gửi ${fmt(total)} cây cho QLV duyệt — chưa cập nhật tồn cho tới khi QLV duyệt.`
                : isSize
                  ? `${fmt(total)} cây đạt size S: trừ khỏi ${pool} và giàn/kệ, cộng vào Kho thành phẩm vườn. Chỉ cập nhật 1 lần.`
                  : `Trừ ${fmt(total)} cây hỏng khỏi ${pool} và giàn/kệ. Chỉ cập nhật 1 lần.`}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={busy}>Huỷ</Button>
            <Button disabled={busy} onClick={() => {
              if (confirm === "submit") call({ action: "submit", items: itemsPayload(), notes: notes.trim() || undefined });
              else if (confirm === "confirm") call({ action: "confirm", items: itemsPayload() });
              else if (!reason.trim()) toast.error("Nhập lý do trả lại");
              else call({ action: "return", reason: reason.trim() });
            }}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
