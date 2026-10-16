import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getAllOrchidCustomerDebts, getAllOrchidSupplierDebts, getOrchidSupplierLedger } from "@/lib/orchid/server";
import { getOrchidAccountOptions } from "@/lib/orchid/queries";
import { formatVND, formatDateVN, ORCHID_PAYMENT_METHOD_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import PaymentDialog from "@/components/orchid/payment-dialog";
import LedgerTable from "@/components/orchid/ledger-table";
import DeletePaymentButton from "./delete-payment-button";

const TABS = [
  { key: "customers", label: "Công nợ khách hàng" },
  { key: "suppliers", label: "Công nợ nhà cung cấp" },
  { key: "payments", label: "Phiếu thu / chi gần đây" },
] as const;

export default async function OrchidDebtsPage({ searchParams }: { searchParams: Promise<{ tab?: string; supplierId?: string; overdue?: string }> }) {
  const user = await requireOrchidStaffPage();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "customers";
  const accounts = await getOrchidAccountOptions();

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Công nợ & thanh toán" description="Sổ công nợ theo giao dịch — tiền mặt và chuyển khoản, nhiều tài khoản nhận" />
      <div className="flex gap-1 border-b border-divider">
        {TABS.map((t) => (
          <Link key={t.key} href={`/orchid/debts?tab=${t.key}`} className={cn("px-3 py-2 text-sm rounded-t-lg", tab === t.key ? "bg-primary-light text-primary-strong font-semibold" : "text-text-secondary hover:bg-primary-light/50")}>
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "customers" && <CustomerDebts accounts={accounts} overdueOnly={sp.overdue === "1"} />}
      {tab === "suppliers" && <SupplierDebts accounts={accounts} supplierId={sp.supplierId} />}
      {tab === "payments" && <RecentPayments canDelete={user.isOrchidAdmin} />}
    </div>
  );
}

type Accounts = Awaited<ReturnType<typeof getOrchidAccountOptions>>;

async function CustomerDebts({ accounts, overdueOnly }: { accounts: Accounts; overdueOnly: boolean }) {
  const [customers, debts] = await Promise.all([
    prisma.orchidCustomer.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true, creditLimit: true } }),
    getAllOrchidCustomerDebts(prisma),
  ]);
  const rows = customers
    .map((c) => ({ ...c, d: debts.get(c.id) }))
    .filter((r) => r.d && (overdueOnly ? r.d.overdue > 0.5 : Math.abs(r.d.outstanding) > 0.5 || r.d.totalReceivable > 0))
    .sort((a, b) => (b.d?.outstanding ?? 0) - (a.d?.outstanding ?? 0));
  const sum = (k: "totalReceivable" | "paid" | "outstanding" | "overdue") => rows.reduce((s, r) => s + (r.d?.[k] ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Tổng phải thu" value={formatVND(sum("totalReceivable"))} />
        <StatCard label="Đã thu" value={formatVND(sum("paid"))} tone="info" />
        <StatCard label="Còn nợ" value={formatVND(sum("outstanding"))} tone="warning" />
        <StatCard label="Quá hạn" value={formatVND(sum("overdue"))} tone="danger" />
      </div>
      <Link href={overdueOnly ? "/orchid/debts?tab=customers" : "/orchid/debts?tab=customers&overdue=1"} className="text-sm underline text-text-secondary">
        {overdueOnly ? "Hiện tất cả khách có phát sinh" : "Chỉ xem khách quá hạn"}
      </Link>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Khách hàng</th>
                <th className={THR}>Tổng phải thu</th>
                <th className={THR}>Đã thu</th>
                <th className={THR}>Còn nợ</th>
                <th className={THR}>Quá hạn</th>
                <th className={THR}>Hạn mức</th>
                <th className={TH}>Đến hạn gần nhất</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow colSpan={8} text="Không có công nợ" />
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className={TR}>
                    <td className={TD}><Link className="font-medium hover:underline" href={`/orchid/customers/${r.id}`}>{r.name}</Link><div className="text-xs text-text-muted">{r.code}</div></td>
                    <td className={TDR}>{formatVND(r.d?.totalReceivable)}</td>
                    <td className={TDR}>{formatVND(r.d?.paid)}</td>
                    <td className={`${TDR} font-semibold`}>{formatVND(r.d?.outstanding)}</td>
                    <td className={`${TDR} ${r.d && r.d.overdue > 0.5 ? "text-destructive font-semibold" : ""}`}>{formatVND(r.d?.overdue)}</td>
                    <td className={TDR}>
                      {r.creditLimit == null ? "—" : formatVND(r.creditLimit)}
                      {r.creditLimit != null && r.d && r.d.outstanding > r.creditLimit && <div className="text-xs text-destructive">Vượt hạn mức</div>}
                    </td>
                    <td className={TD}>{formatDateVN(r.d?.nextDueDate)}</td>
                    <td className={TD}><PaymentDialog kind="customer" targetId={r.id} targetName={r.name} accounts={accounts} size="sm" triggerLabel="Thu tiền" /></td>
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

async function SupplierDebts({ accounts, supplierId }: { accounts: Accounts; supplierId?: string }) {
  const [suppliers, debts] = await Promise.all([
    prisma.orchidSupplier.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    getAllOrchidSupplierDebts(prisma),
  ]);
  const selected = supplierId ? suppliers.find((s) => s.id === supplierId) : undefined;
  const ledger = selected ? await getOrchidSupplierLedger(prisma, selected.id) : null;
  const totalPayable = [...debts.values()].reduce((s, d) => s + d.outstanding, 0);
  const totalOverdue = [...debts.values()].reduce((s, d) => s + d.overdue, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Tổng còn phải trả" value={formatVND(totalPayable)} tone="danger" />
        <StatCard label="Quá hạn" value={formatVND(totalOverdue)} tone={totalOverdue > 0 ? "danger" : "default"} />
        <StatCard label="NCC đang nợ" value={[...debts.values()].filter((d) => d.outstanding > 0.5).length} />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Nhà cung cấp</th>
                <th className={THR}>Phải trả</th>
                <th className={THR}>Đã trả</th>
                <th className={THR}>Còn phải trả</th>
                <th className={THR}>Quá hạn</th>
                <th className={TH}>Ngày đến hạn</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.filter((s) => debts.has(s.id)).length === 0 ? (
                <EmptyRow colSpan={7} text="Chưa có công nợ nhà cung cấp" />
              ) : (
                suppliers
                  .filter((s) => debts.has(s.id))
                  .map((s) => {
                    const d = debts.get(s.id)!;
                    return (
                      <tr key={s.id} className={TR}>
                        <td className={TD}><Link href={`/orchid/debts?tab=suppliers&supplierId=${s.id}`} className="font-medium hover:underline">{s.name}</Link><div className="text-xs text-text-muted">{s.code}</div></td>
                        <td className={TDR}>{formatVND(d.totalReceivable)}</td>
                        <td className={TDR}>{formatVND(d.paid)}</td>
                        <td className={`${TDR} font-semibold`}>{formatVND(d.outstanding)}</td>
                        <td className={`${TDR} ${d.overdue > 0.5 ? "text-destructive font-semibold" : ""}`}>{formatVND(d.overdue)}</td>
                        <td className={TD}>{formatDateVN(d.nextDueDate)}</td>
                        <td className={TD}><PaymentDialog kind="supplier" targetId={s.id} targetName={s.name} accounts={accounts} size="sm" triggerLabel="Trả tiền" /></td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {selected && ledger && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Sổ công nợ — {selected.name}</SectionTitle>
            <PaymentDialog
              kind="supplier"
              targetId={selected.id}
              targetName={selected.name}
              accounts={accounts}
              triggerLabel="Trả tiền NCC"
              docs={ledger.receipts.map((r) => ({ id: r.id, label: `Phiếu nhập ${r.code}`, unpaid: ledger.summary.unpaidByDoc.get(r.id) }))}
            />
          </div>
          <LedgerTable entries={ledger.ledger} debitLabel="Phải trả" creditLabel="Đã trả" />
        </section>
      )}
    </div>
  );
}

async function RecentPayments({ canDelete }: { canDelete: boolean }) {
  const [cust, supp, point] = await Promise.all([
    prisma.orchidCustomerPayment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { customer: { select: { name: true } }, order: { select: { code: true } }, account: { select: { name: true } } } }),
    prisma.orchidSupplierPayment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { supplier: { select: { name: true } }, receipt: { select: { code: true } }, account: { select: { name: true } } } }),
    prisma.orchidRetailPayment.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { point: { select: { name: true } }, account: { select: { name: true } } } }),
  ]);
  const rows = [
    ...cust.map((p) => ({ id: p.id, kind: "customer" as const, type: "Thu khách", code: p.code, date: p.paymentDate, who: p.customer.name, doc: p.order?.code, amount: p.amount, method: p.method, account: p.account?.name, by: p.createdByName, note: p.note, createdAt: p.createdAt })),
    ...supp.map((p) => ({ id: p.id, kind: "supplier" as const, type: "Trả NCC", code: p.code, date: p.paymentDate, who: p.supplier.name, doc: p.receipt?.code, amount: -p.amount, method: p.method, account: p.account?.name, by: p.createdByName, note: p.note, createdAt: p.createdAt })),
    ...point.map((p) => ({ id: p.id, kind: "point" as const, type: "Điểm bán nộp", code: "—", date: p.paymentDate, who: p.point.name, doc: undefined, amount: p.amount, method: p.method, account: p.account?.name, by: p.createdByName, note: p.note, createdAt: p.createdAt })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-primary-light">
              <th className={TH}>Ngày</th>
              <th className={TH}>Loại</th>
              <th className={TH}>Mã</th>
              <th className={TH}>Đối tượng</th>
              <th className={TH}>Chứng từ</th>
              <th className={TH}>Hình thức / Tài khoản</th>
              <th className={THR}>Số tiền</th>
              <th className={TH}>Người ghi</th>
              {canDelete && <th className={TH}></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={canDelete ? 9 : 8} text="Chưa có phiếu thu/chi" />
            ) : (
              rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className={TR}>
                  <td className={TD}>{formatDateVN(r.date)}</td>
                  <td className={TD}>{r.type}</td>
                  <td className={`${TD} font-mono`}>{r.code}</td>
                  <td className={TD}>{r.who}{r.note && <div className="text-xs text-text-muted">{r.note}</div>}</td>
                  <td className={TD}>{r.doc ?? "—"}</td>
                  <td className={TD}>{ORCHID_PAYMENT_METHOD_LABELS[r.method]}{r.account && <div className="text-xs text-text-muted">{r.account}</div>}</td>
                  <td className={`${TDR} font-semibold ${r.amount < 0 ? "text-destructive" : "text-primary-strong"}`}>{formatVND(r.amount)}</td>
                  <td className={TD}>{r.by}</td>
                  {canDelete && <td className={TD}><DeletePaymentButton id={r.id} kind={r.kind} /></td>}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
