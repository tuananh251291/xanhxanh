import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidCustomerDebt } from "@/lib/orchid/server";
import { getOrchidAccountOptions } from "@/lib/orchid/queries";
import { formatVND, formatDateVN, ORCHID_ORDER_STATUS_LABELS, ORCHID_ORDER_STATUS_VARIANT } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import PaymentDialog from "@/components/orchid/payment-dialog";
import LedgerTable from "@/components/orchid/ledger-table";

export default async function OrchidCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrchidStaffPage();
  const { id } = await params;
  const customer = await prisma.orchidCustomer.findUnique({ where: { id }, include: { user: { select: { email: true } } } });
  if (!customer) notFound();
  const [{ ledger, summary, orders: delivered }, orders, accounts] = await Promise.all([
    getOrchidCustomerDebt(prisma, id),
    prisma.orchidOrder.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
    getOrchidAccountOptions(),
  ]);

  return (
    <div className="space-y-5">
      <OrchidPageHeader
        title={customer.name}
        description={
          <>
            <span className="font-mono">{customer.code}</span> · {customer.phone ?? "—"} · {customer.address ?? "—"}
            {customer.user && <> · Tài khoản: {customer.user.email}</>}
          </>
        }
        actions={
          <>
            <Link href={`/orchid/orders/new?customerId=${customer.id}`}><Button variant="outline">Tạo đơn hàng</Button></Link>
            <PaymentDialog kind="customer" targetId={customer.id} targetName={customer.name} accounts={accounts} docs={delivered.map((o) => ({ id: o.id, label: `Đơn ${o.code}` }))} />
          </>
        }
      />
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatCard label="Tổng phải thu" value={formatVND(summary.totalReceivable)} />
        <StatCard label="Đã thu" value={formatVND(summary.paid)} tone="info" />
        <StatCard label="Còn nợ" value={formatVND(summary.outstanding)} tone="warning" />
        <StatCard label="Quá hạn" value={formatVND(summary.overdue)} tone={summary.overdue > 0 ? "danger" : "default"} />
        <StatCard label="Hạn mức công nợ" value={customer.creditLimit == null ? "Không giới hạn" : formatVND(customer.creditLimit)} />
        <StatCard label="Ngày đến hạn gần nhất" value={formatDateVN(summary.nextDueDate)} sub={`Được nợ ${customer.paymentTermDays} ngày`} />
      </div>

      <section className="space-y-2">
        <SectionTitle>Sổ công nợ</SectionTitle>
        <LedgerTable entries={ledger} />
      </section>

      <section className="space-y-2">
        <SectionTitle>Lịch sử đơn hàng</SectionTitle>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className={TH}>Mã đơn</th>
                  <th className={TH}>Ngày tạo</th>
                  <th className={TH}>Trạng thái</th>
                  <th className={THR}>Tổng tiền</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <EmptyRow colSpan={4} text="Chưa có đơn hàng" />
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className={TR}>
                      <td className={TD}><Link className="font-mono text-info-foreground hover:underline" href={`/orchid/orders/${o.id}`}>{o.code}</Link></td>
                      <td className={TD}>{formatDateVN(o.createdAt)}</td>
                      <td className={TD}><Badge variant={ORCHID_ORDER_STATUS_VARIANT[o.status]}>{ORCHID_ORDER_STATUS_LABELS[o.status]}</Badge></td>
                      <td className={TDR}>{formatVND(o.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
