"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, FileDown, Loader2, PenLine, X, Ban } from "lucide-react";
import { toast } from "sonner";
import InvoiceSheet, { type InvoiceSheetProfile } from "@/components/shared/invoice-sheet";
import type { InvoiceResult } from "@/lib/invoice-engine";
import { INVOICE_STATUS } from "../invoice-list";

type Inv = {
  id: string; invoiceNo: string; invoiceDate: string; status: string;
  customerName: string; customerAddress: string | null; customerEmail: string | null;
  marketName: string; marketCode: string; kind: string;
  order: { id: string; code: string; status: string } | null; note: string | null; rejectionReason: string | null; hasManualPrice: boolean;
  createdBy: string; createdAt: string; decidedBy: string | null; decidedAt: string | null;
  profile: InvoiceSheetProfile | null; result: InvoiceResult;
};

export default function InvoiceDetail({ invoice: inv, canApprove, canEdit }: { invoice: Inv; canApprove: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [view, setView] = useState<"customer" | "internal">("customer");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const act = async (body: object, ok: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(j.message ?? "Có lỗi xảy ra"); return; }
      toast.success(ok); setRejecting(false); router.refresh();
    } finally { setBusy(false); }
  };
  // In / lưu PDF bằng hộp thoại in của trình duyệt — tên file mặc định = số invoice.
  const exportPdf = () => {
    const old = document.title;
    document.title = view === "customer" ? inv.invoiceNo : `${inv.invoiceNo}-noi-bo`;
    window.print();
    setTimeout(() => { document.title = old; }, 500);
  };
  const st = INVOICE_STATUS[inv.status];
  const approved = inv.status === "APPROVED";

  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-3">
        <Link href="/invoices" className="text-sm text-text-secondary inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Danh sách đơn đặt hàng</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground font-mono">{inv.invoiceNo}</h1>
          <Badge variant={st?.variant ?? "outline"}>{st?.label ?? inv.status}</Badge>
          {inv.order
            ? <span className="text-sm text-text-secondary">Đơn <span className="font-mono">{inv.order.code}</span></span>
            : <span className="text-sm text-text-secondary">Báo giá độc lập</span>}
        </div>
        <p className="text-xs text-text-muted">
          Lập bởi {inv.createdBy} · {new Date(inv.createdAt).toLocaleString("vi-VN")}
          {inv.decidedBy && ` · ${inv.status === "REJECTED" ? "Từ chối" : "Duyệt"} bởi ${inv.decidedBy}${inv.decidedAt ? " · " + new Date(inv.decidedAt).toLocaleString("vi-VN") : ""}`}
          {inv.note && ` · Ghi chú: ${inv.note}`}
        </p>
        {inv.status === "PENDING_APPROVAL" && <p className="rounded-md bg-warning-light text-warning-foreground text-sm px-4 py-2">Đơn đặt hàng có giá nhập tay — chờ Admin cấp cao duyệt mới xuất PDF / xác nhận đơn được.</p>}
        {inv.status === "REJECTED" && <p className="rounded-md bg-danger-light text-destructive text-sm px-4 py-2">Bị từ chối: {inv.rejectionReason ?? "(không ghi lý do)"} — sửa rồi lưu để gửi duyệt lại.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={view === "customer" ? "default" : "outline"} onClick={() => setView("customer")}>Bản gửi khách</Button>
          <Button size="sm" variant={view === "internal" ? "default" : "outline"} onClick={() => setView("internal")}>Bản nội bộ</Button>
          <span className="flex-1" />
          {canApprove && inv.status === "PENDING_APPROVAL" && (
            <>
              <Button size="sm" disabled={busy} onClick={() => act({ action: "approve" }, "Đã duyệt đơn đặt hàng")}><Check className="w-4 h-4 mr-1" /> Duyệt giá</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X className="w-4 h-4 mr-1" /> Từ chối</Button>
            </>
          )}
          {canEdit && <Link href={`/invoices/${inv.id}/edit`}><Button size="sm" variant="outline"><PenLine className="w-4 h-4 mr-1" /> Sửa</Button></Link>}
          {canEdit && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm(`Huỷ đơn đặt hàng ${inv.invoiceNo}?`)) act({ action: "cancel" }, "Đã huỷ đơn đặt hàng"); }}>
              <Ban className="w-4 h-4 mr-1" /> Huỷ
            </Button>
          )}
          <Button size="sm" disabled={!approved} onClick={exportPdf} title={approved ? "" : "Chỉ xuất PDF khi đơn đặt hàng đã duyệt"}><FileDown className="w-4 h-4 mr-1" /> Xuất PDF</Button>
        </div>
      </div>

      <div className="max-w-4xl">
        <InvoiceSheet
          invoiceNo={inv.invoiceNo} date={inv.invoiceDate} profile={inv.profile}
          customer={{ name: inv.customerName, address: inv.customerAddress, email: inv.customerEmail }}
          marketName={inv.marketName} kind={inv.kind} result={inv.result} view={view}
        />
      </div>
      {inv.hasManualPrice && view === "internal" && (
        <p className="text-xs text-text-muted print:hidden">Dòng giá tay: {inv.result.items.filter((i) => i.manualPrice).map((i) => `${i.code} ${i.unit}`).join(", ")}</p>
      )}

      <Dialog open={rejecting} onOpenChange={(o) => !busy && setRejecting(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Từ chối đơn đặt hàng {inv.invoiceNo}</DialogTitle></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (VD giá thấp hơn mức sàn)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy}>Huỷ</Button>
            <Button onClick={() => act({ action: "reject", reason }, "Đã từ chối")} disabled={busy || !reason.trim()}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Từ chối</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
