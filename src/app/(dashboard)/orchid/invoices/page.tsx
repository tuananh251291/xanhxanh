import Link from "next/link";
import type { OrchidInvoiceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { formatVND, formatDateVN, ORCHID_INVOICE_STATUS_LABELS, ORCHID_INVOICE_STATUS_VARIANT, ORCHID_ORDER_STATUS_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import InvoiceDialog from "./invoice-dialog";

const STATUSES = Object.keys(ORCHID_INVOICE_STATUS_LABELS) as OrchidInvoiceStatus[];

export default async function OrchidInvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireOrchidStaffPage();
  const { status } = await searchParams;
  const current = STATUSES.includes(status as OrchidInvoiceStatus) ? (status as OrchidInvoiceStatus) : null;
  const [orders, counts] = await Promise.all([
    prisma.orchidOrder.findMany({
      where: { needInvoice: true, status: { not: "CANCELLED" }, ...(current ? { invoiceStatus: current } : {}) },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { customer: { select: { name: true } } },
    }),
    prisma.orchidOrder.groupBy({ by: ["invoiceStatus"], where: { needInvoice: true, status: { not: "CANCELLED" } }, _count: true }),
  ]);

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Quản lý hoá đơn" description="Chưa xuất hoá đơn → Chờ xuất → Đã xuất → Đã gửi khách. Đơn có xuất hoá đơn tự sang “Chờ xuất” khi giao hàng." />
      <div className="flex flex-wrap gap-1">
        <Link href="/orchid/invoices" className={cn("px-3 py-1.5 rounded-lg text-sm border", !current ? "bg-primary-light border-primary text-primary-strong font-semibold" : "border-divider text-text-secondary")}>
          Tất cả ({counts.reduce((s, c) => s + c._count, 0)})
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/orchid/invoices?status=${s}`} className={cn("px-3 py-1.5 rounded-lg text-sm border", current === s ? "bg-primary-light border-primary text-primary-strong font-semibold" : "border-divider text-text-secondary")}>
            {ORCHID_INVOICE_STATUS_LABELS[s]} ({counts.find((c) => c.invoiceStatus === s)?._count ?? 0})
          </Link>
        ))}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Đơn</th>
                <th className={TH}>Khách / Đơn vị</th>
                <th className={TH}>MST</th>
                <th className={THR}>Tổng (gồm VAT)</th>
                <th className={TH}>Trạng thái HĐ</th>
                <th className={TH}>Số HĐ / Ngày</th>
                <th className={TH}>Người xử lý</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <EmptyRow colSpan={8} text="Không có hoá đơn" />
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className={TR}>
                    <td className={TD}>
                      <Link href={`/orchid/orders/${o.id}`} className="font-mono text-info-foreground hover:underline">{o.code}</Link>
                      <div className="text-xs text-text-muted">{ORCHID_ORDER_STATUS_LABELS[o.status]}</div>
                    </td>
                    <td className={TD}>{o.customer.name}<div className="text-xs text-text-muted">{o.invoiceCompanyName ?? "—"}</div></td>
                    <td className={TD}>{o.invoiceTaxCode ?? "—"}</td>
                    <td className={TDR}>{formatVND(o.total)}<div className="text-xs text-text-muted">VAT {o.vatRate}%</div></td>
                    <td className={TD}><Badge variant={ORCHID_INVOICE_STATUS_VARIANT[o.invoiceStatus]}>{ORCHID_INVOICE_STATUS_LABELS[o.invoiceStatus]}</Badge></td>
                    <td className={TD}>{o.invoiceNumber ?? "—"}<div className="text-xs text-text-muted">{formatDateVN(o.invoiceDate)}</div></td>
                    <td className={TD}>{o.invoiceHandlerName ?? "—"}</td>
                    <td className={TD}>
                      <InvoiceDialog
                        order={{
                          id: o.id, code: o.code, needInvoice: o.needInvoice, invoiceStatus: o.invoiceStatus, invoiceCompanyName: o.invoiceCompanyName,
                          invoiceTaxCode: o.invoiceTaxCode, invoiceAddress: o.invoiceAddress, invoiceEmail: o.invoiceEmail, invoiceNumber: o.invoiceNumber,
                          invoiceDate: o.invoiceDate?.toISOString() ?? null, invoiceNote: o.invoiceNote,
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
