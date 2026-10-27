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
import { GARDEN_DAMAGE_FLOW_LABELS, GARDEN_DAMAGE_STATUS_LABELS, GARDEN_STOCK_POOL_LABELS } from "@/lib/garden-receipt-constants";

type Status = keyof typeof GARDEN_DAMAGE_STATUS_LABELS;
type Item = {
  id: string; stageCode: string; initialQuantity: number; reportedQuantity: number; confirmedQuantity: number | null; notes: string | null;
  remaining: number; plantType: { code: string; name: string };
};
type Report = {
  id: string; code: string; flow: keyof typeof GARDEN_DAMAGE_FLOW_LABELS; status: Status; notes: string | null; returnReason: string | null;
  createdAt: string; submittedAt: string | null; confirmedAt: string | null;
  garden: { name: string }; createdBy: { name: string }; confirmedBy: { name: string } | null;
  receipt: { id: string; code: string; createdAt: string; fromWarehouse: { name: string }; fromRoom: { name: string } | null };
  items: Item[];
  logs: { id: string; action: string; detail: string; at: string; by: { name: string } }[];
};

const STATUS_BADGE: Record<Status, "info" | "in-progress" | "overdue" | "completed"> = {
  DRAFT: "info", SUBMITTED: "in-progress", RETURNED: "overdue", CONFIRMED: "completed",
};
const LOG_LABELS: Record<string, string> = { SUBMIT: "NV gửi QLV", RETURN: "QLV trả lại", CONFIRM: "QLV xác nhận" };
const fmt = (n: number) => n.toLocaleString("vi-VN");
const dt = (s: string | null) => (s ? format(new Date(s), "dd/MM/yyyy HH:mm") : "");

export default function GardenDamageDetail({ report, canEdit, canReview }: { report: Report; canEdit: boolean; canReview: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // NV nhập số hỏng (bắt đầu từ số đã lưu); QLV nhập số chốt (bắt đầu từ số NV báo).
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(report.items.map((i) => [i.id, String(i.reportedQuantity)])));
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(Object.fromEntries(report.items.map((i) => [i.id, i.notes ?? ""])));
  const [notes, setNotes] = useState(report.notes ?? "");
  const [confirm, setConfirm] = useState<"submit" | "confirm" | "return" | null>(null);
  const [reason, setReason] = useState("");

  const editable = canEdit || canReview;
  const pool = GARDEN_STOCK_POOL_LABELS[report.flow];

  const validate = () => {
    for (const it of report.items) {
      const v = Number(qty[it.id]);
      if (qty[it.id] === "" || !Number.isInteger(v) || v < 0) { toast.error(`${it.plantType.code} ${it.stageCode}: nhập số hỏng (0 nếu không có)`); return false; }
      if (v > it.remaining) { toast.error(`${it.plantType.code} ${it.stageCode}: vượt số còn lại ${fmt(it.remaining)}`); return false; }
    }
    return true;
  };
  const itemsPayload = () => report.items.map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]), notes: itemNotes[i.id]?.trim() || undefined }));

  const call = async (body: object) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/garden-damage/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(json.message);
      setConfirm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const totalInitial = report.items.reduce((s, i) => s + i.initialQuantity, 0);
  const totalDamaged = report.items.reduce((s, i) => s + (Number(qty[i.id]) || 0), 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/garden-damage"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{GARDEN_DAMAGE_FLOW_LABELS[report.flow]}</h1>
            <p className="text-text-secondary text-sm"><span className="font-mono">{report.code}</span> · {report.garden.name} · trừ {pool} khi QLV xác nhận</p>
          </div>
        </div>
        <Badge variant={STATUS_BADGE[report.status]}>{GARDEN_DAMAGE_STATUS_LABELS[report.status]}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-2 sm:grid-cols-2 text-sm">
          <p><span className="text-text-secondary">Phiếu bàn giao ban đầu:</span> <Link href={`/garden-receipts/${report.receipt.id}`} className="font-mono text-primary-strong underline underline-offset-2">{report.receipt.code}</Link></p>
          <p><span className="text-text-secondary">Ngày bàn giao:</span> {dt(report.receipt.createdAt)}</p>
          <p><span className="text-text-secondary">Phòng ban bàn giao:</span> {report.receipt.fromWarehouse.name}{report.receipt.fromRoom ? ` · ${report.receipt.fromRoom.name}` : " · Phòng ra rễ"}</p>
          <p><span className="text-text-secondary">Người lập phiếu:</span> {report.createdBy.name} · {dt(report.createdAt)}</p>
          {report.submittedAt && <p><span className="text-text-secondary">Gửi QLV:</span> {dt(report.submittedAt)}</p>}
          {report.confirmedBy && <p><span className="text-text-secondary">Người xác nhận:</span> {report.confirmedBy.name} · {dt(report.confirmedAt)}</p>}
        </CardContent>
      </Card>

      {report.status === "RETURNED" && report.returnReason && (
        <p className="text-sm text-destructive bg-danger-light rounded-lg p-3 flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" /> QLV trả lại: {report.returnReason}
        </p>
      )}
      {canReview && (
        <p className="text-sm text-info-foreground bg-info-light rounded-lg p-3">
          Kiểm tra số liệu NV gửi — sửa số ở cột &quot;Số hỏng&quot; nếu chưa đúng rồi bấm Xác nhận (hệ thống lưu cả số NV báo và số QLV sửa), hoặc Trả lại để NV kiểm tra và gửi lại.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Chi tiết ({report.items.length} mã · {fmt(totalInitial)} cây ban đầu · {fmt(totalDamaged)} cây hỏng)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã cây / Tên cây</th>
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                  <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Số lượng ban đầu</th>
                  {report.status !== "DRAFT" && <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">NV báo</th>}
                  <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Số hỏng</th>
                  <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((it) => {
                  const final = report.status === "CONFIRMED" ? it.confirmedQuantity ?? 0 : null;
                  return (
                    <tr key={it.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                      <td className="px-4 py-2"><span className="font-mono text-text-secondary mr-1.5">{it.plantType.code}</span>{it.plantType.name}</td>
                      <td className="px-4 py-2">{it.stageCode}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {fmt(it.initialQuantity)}
                        {it.remaining !== it.initialQuantity && <span className="block text-xs text-text-muted">còn ghi được {fmt(it.remaining)}</span>}
                      </td>
                      {report.status !== "DRAFT" && <td className="px-4 py-2 text-right tabular-nums text-text-secondary">{fmt(it.reportedQuantity)}</td>}
                      <td className="px-4 py-2 text-right">
                        {editable ? (
                          <Input type="number" min={0} max={it.remaining} className="h-8 w-24 ml-auto text-right" value={qty[it.id] ?? ""}
                            onChange={(e) => setQty((p) => ({ ...p, [it.id]: e.target.value }))} />
                        ) : (
                          <span className="tabular-nums font-medium text-destructive">
                            {fmt(final ?? it.reportedQuantity)}
                            {final !== null && final !== it.reportedQuantity && <span className="block text-xs text-text-muted font-normal">QLV sửa từ {fmt(it.reportedQuantity)}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <Input className="h-8 w-48" maxLength={300} value={itemNotes[it.id] ?? ""} onChange={(e) => setItemNotes((p) => ({ ...p, [it.id]: e.target.value }))} />
                        ) : (
                          <span className="text-text-secondary">{it.notes || "—"}</span>
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
            <Button disabled={busy} onClick={() => { if (validate()) setConfirm("submit"); }}>
              <Send className="w-4 h-4 mr-1.5" /> Gửi QLV xác nhận
            </Button>
          </div>
        </div>
      )}
      {!canEdit && report.notes && <p className="text-sm"><span className="text-text-secondary">Ghi chú phiếu:</span> {report.notes}</p>}

      {canReview && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => { if (validate()) setConfirm("confirm"); }}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" /> Xác nhận
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => setConfirm("return")}>
            <Undo2 className="w-4 h-4 mr-1.5" /> Trả lại kiểm tra lại
          </Button>
        </div>
      )}

      {report.logs.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Lịch sử xử lý</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {report.logs.map((l) => (
              <p key={l.id}>
                <span className="text-text-secondary">{dt(l.at)}</span> · <strong>{LOG_LABELS[l.action] ?? l.action}</strong> ({l.by.name}) — {l.detail}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o && !busy) setConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm === "submit" ? "Gửi phiếu cho QLV?" : confirm === "confirm" ? "Xác nhận phiếu?" : "Trả lại phiếu?"}</DialogTitle>
          </DialogHeader>
          {confirm === "return" ? (
            <div className="space-y-1">
              <Label>Lý do trả lại</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="VD: Số hỏng mã AL001 chưa khớp thực tế" />
            </div>
          ) : (
            <p className="text-sm text-foreground">
              {confirm === "submit"
                ? `Gửi ${fmt(totalDamaged)} cây hỏng cho QLV xác nhận — chưa trừ tồn cho tới khi QLV xác nhận.`
                : `Trừ ${fmt(totalDamaged)} cây hỏng khỏi ${pool}. Mỗi phiếu chỉ trừ tồn 1 lần, không sửa lại được sau khi xác nhận.`}
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
