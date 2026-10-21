"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { monthLabelVi } from "@/lib/price-list-shared";

type Item = { id: string; code: string; name: string; spec: string; stageCode: string | null; prices: (number | null)[]; plantType: { code: string; name: string } | null };
type Row = { code: string; name: string; spec: string; prices: (number | null)[] };
type Detail = {
  id: string; month: string; currency: string; tiers: string[]; status: "PENDING" | "APPROVED" | "REJECTED"; fileName: string | null; note: string | null;
  rejectionReason: string | null; createdAt: string; decidedAt: string | null;
  market: { code: string; name: string; currency: string; derivedCurrency: string | null };
  uploadedBy: { name: string }; decidedBy: { name: string } | null;
  items: Item[];
  previous: { id: string; month: string } | null;
  diff: { added: Row[]; removed: Row[]; changed: { row: Row; before: (number | null)[] }[] } | null;
  derived: { currency: string; rate: number | null; note: string } | null;
};
const STATUS = { APPROVED: { label: "Đã duyệt", v: "completed" }, PENDING: { label: "Chờ duyệt", v: "in-progress" }, REJECTED: { label: "Bị từ chối", v: "overdue" } } as const;
const fmtP = (v: number | null | undefined, cur: string) =>
  v == null ? "" : v.toLocaleString("en-US", { maximumFractionDigits: cur === "IDR" ? 0 : 2 });

export default function PriceListDetail({ id, canApprove }: { id: string; canApprove: boolean }) {
  const [d, setD] = useState<Detail | null>(null);
  const [q, setQ] = useState("");
  const [showDerived, setShowDerived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/price-lists/${id}`);
    const json = await res.json();
    if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
    setD(json);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    if (!d) return [];
    const s = q.trim().toLowerCase();
    return s ? d.items.filter((i) => `${i.code} ${i.name} ${i.spec} ${i.plantType?.code ?? ""}`.toLowerCase().includes(s)) : d.items;
  }, [d, q]);

  const decide = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/price-lists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(json.message ?? "Có lỗi xảy ra"); return; }
      toast.success(action === "approve" ? "Đã duyệt bảng giá" : "Đã từ chối bảng giá");
      setRejectOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>;
  const cur = showDerived && d.derived?.rate ? d.derived.currency : d.currency;
  const conv = (v: number | null) => (v == null ? null : showDerived && d.derived?.rate ? Math.round(v * d.derived.rate * 100) / 100 : v);
  const unmatched = d.items.filter((i) => !i.plantType).length;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/price-lists" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-2"><ArrowLeft className="w-4 h-4" /> Bảng giá tháng</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Bảng giá {d.market.name} — {monthLabelVi(d.month)}</h1>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS[d.status].v}>{STATUS[d.status].label}</Badge>
            {canApprove && d.status === "PENDING" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} disabled={busy}><X className="w-4 h-4 mr-1" /> Từ chối</Button>
                <Button size="sm" onClick={() => decide("approve")} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Duyệt</Button>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-text-secondary mt-1">
          {d.items.length} dòng · đơn vị {d.currency} · tải lên bởi {d.uploadedBy.name}{d.fileName ? ` (${d.fileName})` : ""}
          {d.decidedBy && ` · ${d.status === "APPROVED" ? "duyệt" : "từ chối"} bởi ${d.decidedBy.name}`}
        </p>
        {d.note && <p className="text-sm text-text-secondary">Ghi chú: {d.note}</p>}
        {d.rejectionReason && <p className="text-sm text-destructive">Lý do từ chối: {d.rejectionReason}</p>}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">So với bảng đang áp dụng trước đó</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {!d.diff ? (
            <p className="text-text-muted">Bảng giá đầu tiên của thị trường — không có bảng trước để so.</p>
          ) : (
            <>
              <p className="text-text-secondary">So với bảng {d.previous ? monthLabelVi(d.previous.month) : ""}:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="completed">+{d.diff.added.length} cây mới</Badge>
                <Badge variant="overdue">−{d.diff.removed.length} cây bỏ</Badge>
                <Badge variant="in-progress">{d.diff.changed.length} đổi giá</Badge>
              </div>
              {(d.diff.added.length + d.diff.removed.length + d.diff.changed.length) > 0 && (
                <details className="border border-divider rounded-lg">
                  <summary className="cursor-pointer px-3 py-2 font-medium">Xem chi tiết thay đổi</summary>
                  <div className="px-3 pb-3 space-y-1 max-h-80 overflow-y-auto">
                    {d.diff.added.map((r) => <p key={`a${r.code}${r.spec}`}><Badge variant="completed">Mới</Badge> <span className="font-mono">{r.code}</span> {r.name} <span className="text-text-muted">{r.spec}</span></p>)}
                    {d.diff.removed.map((r) => <p key={`r${r.code}${r.spec}`}><Badge variant="overdue">Bỏ</Badge> <span className="font-mono">{r.code}</span> {r.name} <span className="text-text-muted">{r.spec}</span></p>)}
                    {d.diff.changed.map((c) => (
                      <p key={`c${c.row.code}${c.row.spec}`}>
                        <Badge variant="in-progress">Giá</Badge> <span className="font-mono">{c.row.code}</span> {c.row.name}:{" "}
                        <span className="text-text-muted">{c.before.map((v) => fmtP(v, d.currency) || "–").join(" / ")}</span> → <b>{c.row.prices.map((v) => fmtP(v, d.currency) || "–").join(" / ")}</b>
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
          {unmatched > 0 && <p className="text-warning-foreground">{unmatched} dòng chưa đối chiếu được mã cây hệ thống (mã không có trong danh mục cây).</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <Input className="pl-8" placeholder="Tìm mã / tên / quy cách" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {d.derived && (
              <div className="flex items-center gap-2 text-sm">
                <Button size="sm" variant={showDerived ? "outline" : "default"} onClick={() => setShowDerived(false)}>{d.currency}</Button>
                <Button size="sm" variant={showDerived ? "default" : "outline"} onClick={() => setShowDerived(true)} disabled={!d.derived.rate}>{d.derived.currency} (tự tạo)</Button>
                <span className="text-xs text-text-muted">{d.derived.note}</span>
              </div>
            )}
          </div>
          <div className="overflow-x-auto border border-divider rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Mã</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Tên cây</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold">Quy cách</th>
                  <th className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">Mã hệ thống</th>
                  {d.tiers.map((t) => <th key={t} className="text-right px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0 even:bg-primary-light/30">
                    <td className="px-3 py-1.5 font-mono">{i.code}</td>
                    <td className="px-3 py-1.5">{i.name}</td>
                    <td className="px-3 py-1.5 text-text-secondary">{i.spec}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      {i.plantType ? <span className="font-mono">{i.plantType.code}{i.stageCode ? ` · ${i.stageCode}` : ""}</span> : <Badge variant="overdue">Chưa đối chiếu</Badge>}
                    </td>
                    {d.tiers.map((t, k) => <td key={t} className="px-3 py-1.5 text-right tabular-nums">{fmtP(conv(i.prices[k] ?? null), cur)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-text-muted">Đơn vị: {cur}/cây. Ô trống = không bán ở bậc đó.</p>
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={(o) => { if (!busy) setRejectOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Từ chối bảng giá</DialogTitle></DialogHeader>
          <Input placeholder="Lý do (tuỳ chọn)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={busy}>Huỷ</Button>
            <Button onClick={() => decide("reject")} disabled={busy}>Từ chối</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
