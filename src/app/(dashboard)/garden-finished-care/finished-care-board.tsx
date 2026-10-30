"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Flower2, Loader2, HeartCrack, Archive, History, Search } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Action = "DAMAGE" | "LIQUIDATE";
type Line = {
  id: string; stageCode: string; quantity: number; reserved: number; lotCode: string | null; plantCode: string; plantName: string;
  rowLabel: string | null; staffName: string | null;
};
type Log = {
  id: string; type: string; lotCode: string | null; quantity: number; stage: string | null; row: string | null; staff: string | null;
  note: string | null; at: string; plantCode: string; plantName: string; byName: string;
};
type Summary = { damaged: number; liquidated: number; damagedToday: number; liquidatedToday: number; liquidationStock: number };

const ALL = "__all__";
const fmt = (n: number) => n.toLocaleString("vi-VN");
const ACTION_LABELS: Record<Action, string> = { DAMAGE: "Ghi nhận cây hỏng", LIQUIDATE: "Chuyển sang Kho thanh lý" };

export default function FinishedCareBoard({ gardens, gardenId, lines, summary, logs }: {
  gardens: { id: string; code: string; name: string }[]; gardenId: string; lines: Line[]; summary: Summary; logs: Log[];
}) {
  const router = useRouter();
  const [stage, setStage] = useState(ALL);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ action: Action; line: Line; qty: string; note: string } | null>(null);

  const stages = [...new Set(lines.map((l) => l.stageCode))].sort();
  const keyword = q.trim().toLowerCase();
  const shown = lines.filter((l) =>
    (stage === ALL || l.stageCode === stage) &&
    (!keyword || [l.plantCode, l.plantName, l.lotCode ?? "", l.rowLabel ?? "", l.staffName ?? ""].some((s) => s.toLowerCase().includes(keyword))),
  );
  const total = lines.reduce((s, l) => s + l.quantity, 0);
  const byStage = stages.map((s) => ({ s, n: lines.filter((l) => l.stageCode === s).reduce((t, l) => t + l.quantity, 0) }));

  const submit = async () => {
    if (!form || busy) return;
    const qty = Number(form.qty);
    const available = form.line.quantity - form.line.reserved;
    if (!Number.isInteger(qty) || qty <= 0 || qty > available) { toast.error(`Số lượng từ 1 đến ${fmt(available)} (còn lại khả dụng tại nguồn)`); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/garden-finished-care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: form.action, lineId: form.line.id, quantity: qty, expectedQuantity: form.line.quantity, note: form.note.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); router.refresh(); return; }
      toast.success(json.message);
      setForm(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const formAvailable = form ? form.line.quantity - form.line.reserved : 0;
  const formQty = Number(form?.qty ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Flower2 className="w-6 h-6 text-primary-strong" /> Chăm sóc cây thành phẩm</h1>
          <p className="text-text-secondary text-sm mt-1">Cây đang chăm sóc tại Kho thành phẩm vườn (mọi size). NV phát hiện cây hỏng / cần thanh lý báo QLV — QLV kiểm tra thực tế rồi ghi nhận tại đây.</p>
        </div>
        {gardens.length > 1 && (
          <Select items={gardens.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))} value={gardenId} onValueChange={(v) => router.push(`/garden-finished-care?garden=${v}`)}>
            <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
            <SelectContent>{gardens.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} ({g.code})</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-text-secondary">Đang chăm sóc (Kho thành phẩm)</p>
            <p className="text-2xl font-bold text-primary-strong tabular-nums">{fmt(total)}</p>
            <p className="text-xs text-text-muted mt-1">{byStage.length === 0 ? "—" : byStage.map((b) => `${b.s}: ${fmt(b.n)}`).join(" · ")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-text-secondary">Cây hỏng đã ghi nhận</p>
            <p className="text-2xl font-bold text-destructive tabular-nums">{fmt(summary.damaged)}</p>
            <p className="text-xs text-text-muted mt-1">Hôm nay: {fmt(summary.damagedToday)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-text-secondary">Đã chuyển Kho thanh lý</p>
            <p className="text-2xl font-bold text-warning-foreground tabular-nums">{fmt(summary.liquidated)}</p>
            <p className="text-xs text-text-muted mt-1">Hôm nay: {fmt(summary.liquidatedToday)} · Kho thanh lý đang tồn: {fmt(summary.liquidationStock)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Danh sách cây đang chăm sóc — {shown.length} dòng</CardTitle>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <Input className="pl-8 w-56" placeholder="Mã cây, lô, vị trí, NV…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex gap-1">
              {[ALL, ...stages].map((s) => (
                <Button key={s} size="sm" variant={stage === s ? "default" : "outline"} onClick={() => setStage(s)}>{s === ALL ? "Tất cả size" : `Size ${s}`}</Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {shown.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">{lines.length === 0 ? "Kho thành phẩm vườn đang trống" : "Không có dòng phù hợp bộ lọc"}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Mã cây", "Tên cây", "Mã lô", "Size", "Vị trí", "Người phụ trách"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    {["Tồn kho", "Giữ chỗ đơn", "Khả dụng"].map((h) => <th key={h} className="text-right px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => {
                    const available = l.quantity - l.reserved;
                    const open = (action: Action) => setForm({ action, line: l, qty: "", note: "" });
                    return (
                      <tr key={l.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                        <td className="px-3 py-2 font-mono text-text-secondary">{l.plantCode}</td>
                        <td className="px-3 py-2 text-foreground">{l.plantName}</td>
                        <td className="px-3 py-2 font-mono text-xs">{l.lotCode ?? "—"}</td>
                        <td className="px-3 py-2"><Badge variant="info">{l.stageCode}</Badge></td>
                        <td className="px-3 py-2 font-mono">{l.rowLabel ?? <span className="text-text-muted">Chưa xếp</span>}</td>
                        <td className="px-3 py-2">{l.staffName ?? <span className="text-text-muted">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(l.quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">{l.reserved > 0 ? fmt(l.reserved) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(available)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-destructive hover:bg-danger-light" disabled={busy || available <= 0} onClick={() => open("DAMAGE")}>
                              <HeartCrack className="w-3.5 h-3.5 mr-1" /> Cây hỏng
                            </Button>
                            <Button size="sm" variant="outline" className="h-7" disabled={busy || available <= 0} onClick={() => open("LIQUIDATE")}>
                              <Archive className="w-3.5 h-3.5 mr-1" /> Thanh lý
                            </Button>
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

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> Lịch sử ghi nhận cây hỏng & chuyển Kho thanh lý</CardTitle></CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có ghi nhận nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Thời gian", "Thao tác", "Mã cây / Lô", "Size · Vị trí · NV", "Số lượng", "Người thực hiện", "Ghi chú"].map((h) => <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-text-secondary">{format(new Date(l.at), "dd/MM/yyyy HH:mm")}</td>
                      <td className="px-3 py-2">
                        <Badge variant={l.type === "FINISHED_DAMAGE" ? "overdue" : "in-progress"}>{l.type === "FINISHED_DAMAGE" ? "Cây hỏng" : "Chuyển Kho thanh lý"}</Badge>
                      </td>
                      <td className="px-3 py-2"><span className="font-mono text-text-secondary mr-1">{l.plantCode}</span>{l.plantName}<p className="text-xs font-mono text-text-muted">{l.lotCode ?? ""}</p></td>
                      <td className="px-3 py-2 text-xs">{[l.stage, l.row ?? "chưa xếp", l.staff].filter(Boolean).join(" · ")}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(l.quantity)}</td>
                      <td className="px-3 py-2 text-text-secondary">{l.byName}</td>
                      <td className="px-3 py-2 text-xs text-text-muted">{l.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(o) => { if (!o && !busy) setForm(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{form ? ACTION_LABELS[form.action] : ""}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 text-sm">
              <p className="rounded-lg bg-primary-light/40 p-2">
                <span className="font-mono">{form.line.plantCode}</span> {form.line.plantName} · lô {form.line.lotCode ?? "—"}<br />
                Size {form.line.stageCode} · {form.line.rowLabel ?? "chưa xếp"} · {form.line.staffName ?? "chưa giao NV"}<br />
                Tồn {fmt(form.line.quantity)}{form.line.reserved > 0 ? ` · giữ chỗ đơn ${fmt(form.line.reserved)}` : ""} · <strong>khả dụng {fmt(formAvailable)}</strong>
              </p>
              {form.line.reserved > 0 && (
                <p className="text-xs text-warning-foreground">Phần giữ chỗ cho đơn hàng không ghi nhận được ở đây — huỷ phân bổ ở trang Tồn kho & điều phối trước nếu cây đó bị hỏng.</p>
              )}
              <div className="space-y-1">
                <Label>{form.action === "DAMAGE" ? "Số lượng cây hỏng" : "Số lượng chuyển Kho thanh lý"}</Label>
                <div className="flex gap-2">
                  <Input type="number" min={1} max={formAvailable} value={form.qty} autoFocus onChange={(e) => setForm({ ...form, qty: e.target.value })} />
                  <Button type="button" variant="outline" onClick={() => setForm({ ...form, qty: String(formAvailable) })}>Toàn bộ</Button>
                </div>
                {formQty > 0 && formQty <= formAvailable && (
                  <p className="text-xs text-text-secondary">Sau xác nhận, dòng này còn {fmt(form.line.quantity - formQty)} cây{form.action === "LIQUIDATE" ? `, Kho thanh lý +${fmt(formQty)}` : ""}.</p>
                )}
                {formQty > formAvailable && <p className="text-xs text-destructive">Vượt quá {fmt(formAvailable)} cây còn lại khả dụng tại nguồn</p>}
              </div>
              <div className="space-y-1">
                <Label>Ghi chú (tình trạng thực tế)</Label>
                <Input value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setForm(null)}>Huỷ</Button>
            <Button disabled={busy} onClick={submit}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Xác nhận</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
