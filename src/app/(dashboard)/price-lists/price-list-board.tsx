"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Eye, Loader2, Upload, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { monthLabelVi } from "@/lib/price-list-shared";

type ListRow = {
  id: string; month: string; currency: string; status: "PENDING" | "APPROVED" | "REJECTED"; fileName: string | null; createdAt: string; decidedAt: string | null;
  rejectionReason: string | null; rows: number; uploadedBy: { name: string }; decidedBy: { name: string } | null;
};
type MarketRow = {
  id: string; code: string; name: string; currency: string; derivedCurrency: string | null; invoiceCalcKind: string; priceListEnabled: boolean;
  current: { id: string; month: string; rows: number } | null;
  nextStatus: "APPROVED" | "PENDING" | "REJECTED" | "MISSING";
  lists: ListRow[];
};
type Overview = { thisMonth: string; nextMonth: string; markets: MarketRow[] };

const STATUS: Record<string, { label: string; variant: "completed" | "in-progress" | "overdue" | "info" | "outline" }> = {
  APPROVED: { label: "Đã duyệt", variant: "completed" },
  PENDING: { label: "Chờ duyệt", variant: "in-progress" },
  REJECTED: { label: "Bị từ chối", variant: "overdue" },
  MISSING: { label: "Chưa tải", variant: "outline" },
};
const fmtDate = (d: string) => new Date(d).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function PriceListBoard({ canUpload, canApprove }: { canUpload: boolean; canApprove: boolean }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadFor, setUploadFor] = useState<MarketRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/price-lists");
      const json = await res.json();
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  if (!data) return null;

  const enabled = data.markets.filter((m) => m.priceListEnabled);
  const pending = data.markets.flatMap((m) => m.lists.filter((l) => l.status === "PENDING").map((l) => ({ ...l, market: m })));
  const history = data.markets.flatMap((m) => m.lists.map((l) => ({ ...l, market: m }))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40);
  const doneNext = enabled.filter((m) => m.nextStatus === "APPROVED" || m.nextStatus === "PENDING").length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Theo thị trường</CardTitle>
          <p className="text-sm text-text-secondary">
            Tháng này: <b>{monthLabelVi(data.thisMonth)}</b> · Bảng giá {monthLabelVi(data.nextMonth)}: <b>{doneNext}/{enabled.length}</b> thị trường đã tải lên
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thị trường</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Đơn vị tiền</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Đang áp dụng</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">{monthLabelVi(data.nextMonth)}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.markets.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="px-4 py-3">
                      <span className="font-mono text-info-foreground">{m.code}</span> · {m.name}
                      {!m.priceListEnabled && <div className="text-xs text-text-muted">Không dùng bảng giá tháng</div>}
                    </td>
                    <td className="px-4 py-3">{m.currency}{m.derivedCurrency && <span className="text-xs text-text-muted"> (+{m.derivedCurrency} tự tạo)</span>}</td>
                    <td className="px-4 py-3">
                      {m.current ? (
                        <Link href={`/price-lists/${m.current.id}`} className="text-info-foreground underline underline-offset-2">
                          Bảng {monthLabelVi(m.current.month)} · {m.current.rows} dòng
                        </Link>
                      ) : <span className="text-text-muted">Chưa có</span>}
                    </td>
                    <td className="px-4 py-3">{m.priceListEnabled ? <Badge variant={STATUS[m.nextStatus].variant}>{STATUS[m.nextStatus].label}</Badge> : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end">
                        <a href={`/api/price-lists/template?marketId=${m.id}&month=${data.nextMonth}`}>
                          <Button size="sm" variant="outline" className="h-8"><Download className="w-3.5 h-3.5 mr-1.5" /> File mẫu</Button>
                        </a>
                        {canUpload && (
                          <Button size="sm" className="h-8" onClick={() => setUploadFor(m)}><Upload className="w-3.5 h-3.5 mr-1.5" /> Tải lên</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Chờ Admin cấp cao duyệt ({pending.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pending.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 border border-divider rounded-lg px-3 py-2">
                <div className="text-sm">
                  <b>{l.market.name}</b> · {monthLabelVi(l.month)} · {l.rows} dòng · {l.uploadedBy.name} lúc {fmtDate(l.createdAt)}
                </div>
                <Link href={`/price-lists/${l.id}`}>
                  <Button size="sm" className="h-8"><Eye className="w-3.5 h-3.5 mr-1.5" /> {canApprove ? "Xem & duyệt" : "Xem"}</Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Lịch sử tải lên</CardTitle></CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <p className="px-4 pb-6 text-sm text-text-muted">Chưa có bảng giá nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Thị trường</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Tháng</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Người tải / thời gian</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-2">{l.market.name}</td>
                      <td className="px-4 py-2">{monthLabelVi(l.month)} · {l.rows} dòng</td>
                      <td className="px-4 py-2">
                        <Badge variant={STATUS[l.status].variant}>{STATUS[l.status].label}</Badge>
                        {l.rejectionReason && <div className="text-xs text-destructive mt-0.5">{l.rejectionReason}</div>}
                      </td>
                      <td className="px-4 py-2 text-text-secondary">{l.uploadedBy.name} · {fmtDate(l.createdAt)}{l.fileName && <div className="text-xs">{l.fileName}</div>}</td>
                      <td className="px-4 py-2"><Link href={`/price-lists/${l.id}`}><Button size="sm" variant="outline" className="h-8">Xem</Button></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {uploadFor && <UploadDialog market={uploadFor} defaultMonth={data.nextMonth} onClose={() => setUploadFor(null)} onDone={() => { setUploadFor(null); load(); }} />}
    </div>
  );
}

function UploadDialog({ market, defaultMonth, onClose, onDone }: { market: MarketRow; defaultMonth: string; onClose: () => void; onDone: () => void }) {
  const [month, setMonth] = useState(defaultMonth);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!file) { toast.error("Chọn file Excel"); return; }
    setBusy(true);
    setErrors([]);
    try {
      const fd = new FormData();
      fd.append("marketId", market.id);
      fd.append("month", month);
      fd.append("note", note);
      fd.append("file", file);
      const res = await fetch("/api/price-lists", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(json.errors)) setErrors(json.errors);
        toast.error(json.message ?? "Tải lên thất bại");
        return;
      }
      const d = json.diff;
      toast.success(
        `Đã tải ${json.rows} dòng — chờ Admin cấp cao duyệt`,
        { description: [d ? `${d.added} cây mới, ${d.removed} cây bỏ, ${d.changed} đổi giá` : "Bảng giá đầu tiên của thị trường", json.unmatched ? `${json.unmatched} dòng chưa đối chiếu được mã cây hệ thống` : ""].filter(Boolean).join(" · "), duration: 10000 }
      );
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Tải bảng giá — {market.name} ({market.currency})</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <Label className="text-xs">Tháng áp dụng</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">File Excel (theo file mẫu)</Label>
            <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload className="w-3.5 h-3.5 mr-1.5" /> {file ? file.name : "Chọn file"}
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ghi chú (tuỳ chọn)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: thêm 3 mã mới, giảm giá Monstera" />
          </div>
          {market.derivedCurrency && (
            <p className="text-xs text-text-secondary bg-info-light rounded-lg p-2">
              Chỉ tải bảng {market.currency}. Bảng {market.derivedCurrency} tự tạo theo tỉ giá tháng của NV Kế toán.
            </p>
          )}
          {errors.length > 0 && (
            <div className="bg-danger-light rounded-lg p-2 max-h-48 overflow-y-auto space-y-0.5">
              <p className="font-medium text-destructive flex items-center gap-1"><TriangleAlert className="w-4 h-4" /> File có {errors.length} lỗi — chưa lưu gì</p>
              {errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e.row ? `Dòng ${e.row}: ` : ""}{e.message}</p>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Huỷ</Button>
          <Button onClick={submit} disabled={busy || !file}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Tải lên</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
