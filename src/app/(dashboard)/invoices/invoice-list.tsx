"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { fmtMoney } from "@/lib/invoice-engine";

type Row = {
  id: string; invoiceNo: string; invoiceDate: string; currency: string; total: number; status: string; hasManualPrice: boolean;
  customerName: string; rejectionReason: string | null;
  market: { code: string; name: string }; order: { id: string; code: string; status: string } | null; createdBy: { name: string };
};
export const INVOICE_STATUS: Record<string, { label: string; variant: "completed" | "in-progress" | "overdue" | "outline" }> = {
  APPROVED: { label: "Đã duyệt", variant: "completed" },
  PENDING_APPROVAL: { label: "Chờ duyệt giá", variant: "in-progress" },
  REJECTED: { label: "Bị từ chối", variant: "overdue" },
  CANCELLED: { label: "Đã huỷ", variant: "outline" },
};

export default function InvoiceList({ canApprove }: { canApprove: boolean }) {
  const [status, setStatus] = useState(canApprove ? "PENDING_APPROVAL" : "");
  const [month, setMonth] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (month) qs.set("month", month);
    const res = await fetch(`/api/invoices?${qs}`);
    setRows(res.ok ? await res.json() : []);
  }, [status, month]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {[["", "Tất cả"], ["PENDING_APPROVAL", "Chờ duyệt giá"], ["APPROVED", "Đã duyệt"], ["REJECTED", "Bị từ chối"], ["CANCELLED", "Đã huỷ"]].map(([v, l]) => (
          <button key={v} type="button" onClick={() => setStatus(v)}
            className={`rounded-full px-3 py-1 text-sm border ${status === v ? "bg-primary-light text-primary-strong border-primary-light font-bold" : "border-border text-text-secondary"}`}>{l}</button>
        ))}
        <Input type="month" className="w-44 h-9 ml-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <Card>
        <CardContent className="p-0">
          {!rows ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-text-muted" /></div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-text-muted">Không có đơn đặt hàng nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    {["Số đơn đặt hàng", "Ngày", "Khách hàng", "Thị trường", "Đơn hàng", "Tổng", "Trạng thái", "Người lập"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-base text-primary-strong font-bold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-divider last:border-0 hover:bg-primary-light/30">
                      <td className="px-3 py-2 font-mono"><Link href={`/invoices/${r.id}`} className="text-primary-strong font-bold hover:underline">{r.invoiceNo}</Link></td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.invoiceDate.slice(0, 10)}</td>
                      <td className="px-3 py-2">{r.customerName}</td>
                      <td className="px-3 py-2">{r.market.code}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.order?.code ?? <span className="text-text-muted font-sans">Báo giá</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMoney(r.total, r.currency)}</td>
                      <td className="px-3 py-2">
                        <Badge variant={INVOICE_STATUS[r.status]?.variant ?? "outline"}>{INVOICE_STATUS[r.status]?.label ?? r.status}</Badge>
                        {r.hasManualPrice && r.status === "APPROVED" && <span className="block text-xs text-text-muted">có giá tay</span>}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{r.createdBy.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
