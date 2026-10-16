import { prisma } from "@/lib/prisma";
import type { OrchidExpenseGroup } from "@prisma/client";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidAccountOptions } from "@/lib/orchid/queries";
import { formatVND, formatDateVN, ORCHID_EXPENSE_GROUP_LABELS, ORCHID_PAYMENT_METHOD_LABELS } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ExpenseDialog from "./expense-dialog";
import DeleteExpenseButton from "./delete-expense-button";

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+07:00`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start, end: new Date(`${next}-01T00:00:00+07:00`) };
}

export default async function OrchidExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireOrchidStaffPage(true);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
  const { start, end } = monthRange(month);
  const [expenses, categories, accounts] = await Promise.all([
    prisma.orchidExpense.findMany({
      where: { expenseDate: { gte: start, lt: end } },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      include: { category: true, account: { select: { name: true } } },
    }),
    prisma.orchidExpenseCategory.findMany({ where: { isActive: true }, orderBy: [{ group: "asc" }, { sortOrder: "asc" }] }),
    getOrchidAccountOptions(),
  ]);
  const byGroup = (g: OrchidExpenseGroup) => expenses.filter((e) => e.category.group === g).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Quản lý chi phí" description="Chi phí theo nhóm: Mua hàng / Vận hành / Bán hàng / Khác" actions={<ExpenseDialog categories={categories} accounts={accounts} />} />
      <form className="flex items-end gap-2">
        <label className="text-sm space-y-1">
          <span className="block text-text-secondary">Tháng</span>
          <input type="month" name="month" defaultValue={month} className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
        </label>
        <button className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-primary-light">Xem</button>
      </form>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Tổng chi tháng" value={formatVND(expenses.reduce((s, e) => s + e.amount, 0))} tone="danger" />
        {(Object.keys(ORCHID_EXPENSE_GROUP_LABELS) as OrchidExpenseGroup[]).map((g) => (
          <StatCard key={g} label={ORCHID_EXPENSE_GROUP_LABELS[g]} value={formatVND(byGroup(g))} />
        ))}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Mã chi</th>
                <th className={TH}>Ngày</th>
                <th className={TH}>Loại chi</th>
                <th className={THR}>Số tiền</th>
                <th className={TH}>Người nhận</th>
                <th className={TH}>Phương thức / Nguồn chi</th>
                <th className={TH}>Nội dung</th>
                <th className={TH}></th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <EmptyRow colSpan={8} text="Chưa có khoản chi trong tháng" />
              ) : (
                expenses.map((e) => (
                  <tr key={e.id} className={TR}>
                    <td className={`${TD} font-mono`}>{e.code}</td>
                    <td className={TD}>{formatDateVN(e.expenseDate)}</td>
                    <td className={TD}><Badge variant="outline">{ORCHID_EXPENSE_GROUP_LABELS[e.category.group]}</Badge> {e.category.name}</td>
                    <td className={`${TDR} font-semibold`}>{formatVND(e.amount)}</td>
                    <td className={TD}>{e.recipient ?? "—"}</td>
                    <td className={TD}>{ORCHID_PAYMENT_METHOD_LABELS[e.method]}{e.account && <div className="text-xs text-text-muted">{e.account.name}</div>}</td>
                    <td className={TD}>{e.content ?? ""}<div className="text-xs text-text-muted">{e.createdByName}</div></td>
                    <td className={TD}><DeleteExpenseButton id={e.id} code={e.code} /></td>
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
