"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isStockCountEditable, STOCK_COUNT_STATUS_LABELS, summarizeStockCount } from "@/lib/stock-count-shared";
import { STOCK_COUNT_STATUS_CLASSES } from "../status-classes";

type Item = {
  id: string;
  stageCode: string;
  systemQuantity: number;
  actualQuantity: number | null;
  explanation: string | null;
  appliedDelta: number | null;
  room: { name: string };
  plantType: { code: string; name: string };
};
type Report = {
  id: string;
  year: number;
  month: number;
  countDate: string;
  status: keyof typeof STOCK_COUNT_STATUS_LABELS;
  proposal: string | null;
  snapshotAt: string;
  createdAt: string;
  submittedAt: string | null;
  decidedAt: string | null;
  appliedAt: string | null;
  recheckNote: string | null;
  warehouse: { name: string };
  createdBy: { name: string };
  decidedBy: { name: string } | null;
  items: Item[];
};
type Draft = Record<string, { actual: string; explanation: string }>;

const textareaClass =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const num = (n: number) => n.toLocaleString("vi-VN");
const fmtDate = (s: string | null) => (s ? format(new Date(s), "dd/MM/yyyy") : "—");
const fmtDay = (s: string) => format(new Date(`${s.slice(0, 10)}T00:00:00`), "dd/MM/yyyy");

function draftFrom(report: Report): Draft {
  return Object.fromEntries(report.items.map((i) => [i.id, { actual: i.actualQuantity == null ? "" : String(i.actualQuantity), explanation: i.explanation ?? "" }]));
}

export default function StockCountDetail({ id, canEdit, canDecide }: { id: string; canEdit: boolean; canDecide: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [countDate, setCountDate] = useState("");
  const [proposal, setProposal] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [recheckNote, setRecheckNote] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(false);

  const receive = (r: Report) => {
    setReport(r);
    setDraft(draftFrom(r));
    setCountDate(r.countDate.slice(0, 10));
    setProposal(r.proposal ?? "");
  };

  useEffect(() => {
    fetch(`/api/stock-counts/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((r: Report) => { setReport(r); setDraft(draftFrom(r)); setCountDate(r.countDate.slice(0, 10)); setProposal(r.proposal ?? ""); })
      .catch(() => setNotFound(true));
  }, [id]);

  const editable = !!report && canEdit && isStockCountEditable(report.status);

  // Số đang hiển thị: bản nháp đang gõ (nếu được sửa) hoặc số đã lưu.
  const rows = useMemo(
    () =>
      (report?.items ?? []).map((i) => {
        const raw = editable ? draft[i.id]?.actual ?? "" : i.actualQuantity == null ? "" : String(i.actualQuantity);
        const actual = raw === "" ? null : Number(raw);
        return { item: i, actual: actual != null && Number.isFinite(actual) ? actual : null, diff: actual != null && Number.isFinite(actual) ? actual - i.systemQuantity : null };
      }),
    [report, draft, editable]
  );
  const summary = useMemo(() => summarizeStockCount(rows.map((r) => ({ systemQuantity: r.item.systemQuantity, actualQuantity: r.actual }))), [rows]);
  const visibleRows = onlyDiff ? rows.filter((r) => r.diff !== 0) : rows;

  const payload = () => ({
    countDate,
    proposal,
    items: (report?.items ?? []).map((i) => {
      const d = draft[i.id];
      const n = d?.actual === "" || d?.actual == null ? null : Number(d.actual);
      return { id: i.id, actualQuantity: n != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null, explanation: d?.explanation || null };
    }),
  });

  const call = async (key: string, url: string, method: string, body: unknown, okMsg: string | null) => {
    setBusy(key);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { toast.error(json.message ?? "Thao tác thất bại"); return false; }
    receive(json);
    if (okMsg) toast.success(okMsg);
    return true;
  };

  const save = () => call("save", `/api/stock-counts/${id}`, "PATCH", payload(), "Đã lưu");
  const refresh = async () => {
    if (!(await call("save", `/api/stock-counts/${id}`, "PATCH", payload(), null))) return;
    await call("refresh", `/api/stock-counts/${id}`, "POST", { action: "refresh" }, "Đã cập nhật tồn phần mềm theo số hiện tại");
  };
  const submit = async () => {
    if (!(await call("submit", `/api/stock-counts/${id}`, "PATCH", payload(), null))) return;
    await call("submit", `/api/stock-counts/${id}`, "POST", { action: "submit" }, "Đã gửi báo cáo cho Trợ lý, Admin cấp cao, Hành chính nhân sự");
  };

  if (notFound) return <p className="text-text-muted">Không tìm thấy báo cáo hoặc bạn không có quyền xem.</p>;
  if (!report) return <div className="flex items-center gap-2 text-text-secondary"><Loader2 className="w-5 h-5 animate-spin" /> Đang tải…</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/stock-counts" className="text-sm text-primary-strong hover:underline inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Danh sách</Link>
          <h1 className="text-2xl font-bold text-foreground mt-1">Báo cáo đối chiếu tồn kho thành phẩm</h1>
          <p className="text-text-secondary text-sm">Tháng {report.month} / Năm {report.year} · {report.warehouse.name}</p>
        </div>
        <Badge className={cn("text-sm", STOCK_COUNT_STATUS_CLASSES[report.status])}>{STOCK_COUNT_STATUS_LABELS[report.status]}</Badge>
      </div>

      {report.status === "RECHECK_REQUESTED" && report.recheckNote && (
        <div className="rounded-lg bg-danger-light px-4 py-3 text-sm">
          <p className="font-semibold text-destructive">Admin cấp cao yêu cầu kiểm tra lại{report.decidedBy ? ` (${report.decidedBy.name}, ${fmtDate(report.decidedAt)})` : ""}:</p>
          <p className="text-foreground whitespace-pre-wrap mt-1">{report.recheckNote}</p>
        </div>
      )}
      {report.status === "APPLIED" && (
        <div className="rounded-lg bg-primary-light px-4 py-3 text-sm text-primary-strong font-medium">
          Đã áp số liệu thực tế làm tồn đầu kỳ tháng sau ngày {fmtDate(report.appliedAt)}{report.decidedBy ? ` — ${report.decidedBy.name}` : ""}.
        </div>
      )}

      <Card>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 py-4 text-sm">
          <p><span className="text-text-secondary">Người phụ trách:</span> <span className="font-medium">{report.createdBy.name}</span></p>
          <div className="flex items-center gap-2">
            <span className="text-text-secondary">Ngày kiểm kê:</span>
            {editable ? <Input type="date" className="h-8 w-40" value={countDate} onChange={(e) => setCountDate(e.target.value)} /> : <span className="font-medium">{fmtDay(report.countDate)}</span>}
          </div>
          <p><span className="text-text-secondary">Ngày lập báo cáo:</span> <span className="font-medium">{fmtDate(report.submittedAt ?? report.createdAt)}</span></p>
          <p><span className="text-text-secondary">Người xác nhận:</span> <span className="font-medium">{report.status === "APPLIED" ? report.decidedBy?.name ?? "—" : "—"}</span></p>
          <p className="sm:col-span-2 text-xs text-text-muted">Tồn trên phần mềm lấy lúc {format(new Date(report.snapshotAt), "HH:mm dd/MM/yyyy")} · Đơn vị tính: cây</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Phần 1. Bảng đối chiếu tồn kho</CardTitle>
          <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
            <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Chỉ hiện dòng chênh lệch / chưa nhập
          </label>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary-light">
              <tr>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-right">STT</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-left">Mã sản phẩm</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-left">Tên thành phẩm</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-left">Phòng</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-left">Quy cách</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-right">Tồn trên phần mềm</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-right">Tồn thực tế</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-right">Chênh lệch</th>
                <th className="px-2 py-2 text-base text-primary-strong font-bold text-left min-w-56">Giải trình chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ item, actual, diff }) => {
                const idx = rows.findIndex((r) => r.item.id === item.id) + 1;
                const d = draft[item.id];
                return (
                  <tr key={item.id} className={cn("border-b border-divider last:border-0 align-top", diff != null && diff !== 0 && "bg-warning-light/40")}>
                    <td className="px-2 py-1.5 text-right tabular-nums text-text-muted">{idx}</td>
                    <td className="px-2 py-1.5 font-mono">{item.plantType.code}</td>
                    <td className="px-2 py-1.5">{item.plantType.name}</td>
                    <td className="px-2 py-1.5 text-text-secondary whitespace-nowrap">{item.room.name}</td>
                    <td className="px-2 py-1.5">{item.stageCode}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{num(item.systemQuantity)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {editable ? (
                        <Input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="h-8 w-28 ml-auto text-right"
                          value={d?.actual ?? ""}
                          onChange={(e) => setDraft((p) => ({ ...p, [item.id]: { ...p[item.id], actual: e.target.value } }))}
                        />
                      ) : (
                        <span className="tabular-nums">{actual == null ? "—" : num(actual)}</span>
                      )}
                    </td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", diff == null ? "text-text-muted" : diff < 0 ? "text-destructive" : diff > 0 ? "text-info-foreground" : "text-text-secondary")}>
                      {diff == null ? "—" : diff > 0 ? `+${num(diff)}` : num(diff)}
                      {report.status === "APPLIED" && item.appliedDelta != null && item.appliedDelta !== diff && (
                        <div className="text-xs font-normal text-warning-foreground">đã áp {num(item.appliedDelta)}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {editable ? (
                        <Input
                          className={cn("h-8", diff != null && diff !== 0 && !d?.explanation?.trim() && "border-destructive")}
                          placeholder={diff != null && diff !== 0 ? "Bắt buộc giải trình" : ""}
                          value={d?.explanation ?? ""}
                          onChange={(e) => setDraft((p) => ({ ...p, [item.id]: { ...p[item.id], explanation: e.target.value } }))}
                        />
                      ) : (
                        <span className="whitespace-pre-wrap text-text-secondary">{item.explanation || ""}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-primary-light font-bold">
                <td className="px-2 py-2" colSpan={5}>TỔNG</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(summary.totalSystem)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{num(summary.totalActual)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{summary.counted ? num(summary.totalActual - rows.filter((r) => r.actual != null).reduce((s, r) => s + r.item.systemQuantity, 0)) : "—"}</td>
                <td className="px-2 py-2">—</td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-text-muted px-3 py-2">Chênh lệch = Tồn kho thực tế − Tồn kho trên phần mềm. Số âm: thiếu; số dương: thừa.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Phần 2. Kết luận và xác nhận</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-x-8 gap-y-1">
            <p>Tổng số mã đã đối chiếu: <span className="font-bold">{summary.counted}</span>{summary.counted < summary.total ? <span className="text-text-muted"> / {summary.total}</span> : null}</p>
            <p>Số mã khớp tồn kho: <span className="font-bold text-primary-strong">{summary.matched}</span></p>
            <p>Số mã có chênh lệch: <span className="font-bold text-destructive">{summary.mismatched}</span></p>
          </div>
          <div className="space-y-1">
            <Label>Hướng xử lý / đề xuất</Label>
            {editable ? (
              <textarea rows={3} className={textareaClass} value={proposal} onChange={(e) => setProposal(e.target.value)} />
            ) : (
              <p className="whitespace-pre-wrap text-text-secondary">{report.proposal || "—"}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {editable && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={refresh} disabled={!!busy}>
            {busy === "refresh" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Cập nhật tồn phần mềm
          </Button>
          <Button variant="outline" onClick={save} disabled={!!busy}>
            {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu nháp
          </Button>
          <Button onClick={submit} disabled={!!busy}>
            {busy === "submit" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {report.status === "RECHECK_REQUESTED" ? "Gửi lại báo cáo" : "Gửi báo cáo"}
          </Button>
        </div>
      )}

      {canDecide && report.status === "SUBMITTED" && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-text-secondary">Xem xong báo cáo, chọn 1 trong 2:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setRecheckNote(""); setRecheckOpen(true); }} disabled={!!busy}>
                <RotateCcw className="w-4 h-4" /> Cho kiểm tra lại
              </Button>
              <Button onClick={() => setApplyOpen(true)} disabled={!!busy}>
                <CheckCircle2 className="w-4 h-4" /> Áp số thực tế làm tồn đầu kỳ tháng sau
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={recheckOpen} onOpenChange={(o) => { if (!busy) setRecheckOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Yêu cầu kiểm tra lại</DialogTitle></DialogHeader>
          <div className="space-y-1">
            <Label>Nội dung cần kiểm tra lại</Label>
            <textarea rows={4} className={textareaClass} value={recheckNote} onChange={(e) => setRecheckNote(e.target.value)} placeholder="VD: Đếm lại MT001 T05 phòng theo dõi…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecheckOpen(false)} disabled={!!busy}>Huỷ</Button>
            <Button
              disabled={!!busy || !recheckNote.trim()}
              onClick={async () => { if (await call("recheck", `/api/stock-counts/${id}`, "POST", { action: "recheck", note: recheckNote }, "Đã gửi yêu cầu kiểm tra lại")) setRecheckOpen(false); }}
            >
              {busy === "recheck" && <Loader2 className="w-4 h-4 animate-spin" />} Gửi yêu cầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={applyOpen} onOpenChange={(o) => { if (!busy) setApplyOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Áp số thực tế vào tồn kho?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm text-text-secondary">
            <p>Hệ thống sẽ điều chỉnh <span className="font-bold text-foreground">{summary.mismatched}</span> mã có chênh lệch: cộng/trừ đúng phần chênh lệch vào tồn hiện tại (thiếu trừ lô cũ nhất, thừa cộng lô mới nhất), làm tồn đầu kỳ tháng sau.</p>
            <p>Sau khi áp, báo cáo bị khoá, không sửa được nữa.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)} disabled={!!busy}>Huỷ</Button>
            <Button
              disabled={!!busy}
              onClick={async () => { if (await call("apply", `/api/stock-counts/${id}`, "POST", { action: "apply" }, "Đã áp số liệu thực tế vào tồn kho")) setApplyOpen(false); }}
            >
              {busy === "apply" && <Loader2 className="w-4 h-4 animate-spin" />} Xác nhận áp số
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
