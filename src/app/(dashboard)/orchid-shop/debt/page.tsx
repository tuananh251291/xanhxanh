import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidCustomerPage } from "@/lib/orchid/page-guard";
import { getOrchidCustomerDebt } from "@/lib/orchid/server";
import { formatVND, formatNumber, formatDateVN, ORCHID_DELIVERED_STATUSES } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import LedgerTable from "@/components/orchid/ledger-table";
import NoCustomerLinked from "../no-customer";

// Khách chỉ xem công nợ + lịch sử mua của CHÍNH MÌNH.
export default async function OrchidShopDebtPage() {
  const { customer } = await requireOrchidCustomerPage();
  if (!customer) return <NoCustomerLinked />;
  const [{ ledger, summary }, history, bankAccounts] = await Promise.all([
    getOrchidCustomerDebt(prisma, customer.id),
    prisma.orchidOrderItem.findMany({
      where: { order: { customerId: customer.id, status: { in: ORCHID_DELIVERED_STATUSES } } },
      orderBy: { order: { shippedAt: "desc" } },
      take: 300,
      select: { id: true, quantity: true, returnedQuantity: true, unitPrice: true, amount: true, product: { select: { name: true } }, order: { select: { id: true, code: true, shippedAt: true } } },
    }),
    prisma.orchidPaymentAccount.findMany({ where: { isActive: true, type: "BANK_TRANSFER" }, select: { id: true, bankName: true, accountNumber: true, accountHolder: true } }),
  ]);

  return (
    <div className="space-y-5">
      <OrchidPageHeader title="Công nợ & lịch sử mua hàng" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Tổng phải thanh toán" value={formatVND(summary.totalReceivable)} />
        <StatCard label="Đã thanh toán" value={formatVND(summary.paid)} tone="info" />
        <StatCard label="Còn nợ" value={formatVND(summary.outstanding)} tone="warning" />
        <StatCard label="Quá hạn" value={formatVND(summary.overdue)} tone={summary.overdue > 0 ? "danger" : "default"} />
        <StatCard label="Hạn thanh toán gần nhất" value={formatDateVN(summary.nextDueDate)} sub={customer.creditLimit != null ? `Hạn mức ${formatVND(customer.creditLimit)}` : undefined} />
      </div>
      {bankAccounts.length > 0 && (
        <Card>
          <CardContent className="p-4 text-sm space-y-1">
            <p className="font-semibold text-primary-strong">Tài khoản nhận thanh toán</p>
            {bankAccounts.map((a) => <p key={a.id}>{a.bankName} · <span className="font-mono">{a.accountNumber}</span> · {a.accountHolder}</p>)}
          </CardContent>
        </Card>
      )}
      <section className="space-y-2">
        <SectionTitle>Sổ công nợ</SectionTitle>
        <LedgerTable entries={ledger} />
      </section>
      <section className="space-y-2">
        <SectionTitle>Lịch sử mua hàng</SectionTitle>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className={TH}>Ngày giao</th>
                  <th className={TH}>Đơn</th>
                  <th className={TH}>Sản phẩm</th>
                  <th className={THR}>Số lượng</th>
                  <th className={THR}>Đơn giá</th>
                  <th className={THR}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <EmptyRow colSpan={6} text="Chưa có lịch sử mua hàng" />
                ) : (
                  history.map((h) => (
                    <tr key={h.id} className={TR}>
                      <td className={TD}>{formatDateVN(h.order.shippedAt)}</td>
                      <td className={TD}><Link href={`/orchid-shop/orders/${h.order.id}`} className="font-mono text-info-foreground hover:underline">{h.order.code}</Link></td>
                      <td className={TD}>{h.product.name}</td>
                      <td className={TDR}>{formatNumber(h.quantity)}{h.returnedQuantity > 0 && <span className="text-xs text-destructive"> (trả {h.returnedQuantity})</span>}</td>
                      <td className={TDR}>{formatVND(h.unitPrice)}</td>
                      <td className={TDR}>{formatVND(h.amount)}</td>
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
