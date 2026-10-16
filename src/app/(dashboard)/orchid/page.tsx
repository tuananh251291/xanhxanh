import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getAllOrchidCustomerDebts, getAllOrchidSupplierDebts, getOrchidPointSummaries } from "@/lib/orchid/server";
import { ORCHID_DELIVERED_STATUSES, formatVND, formatNumber } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";

const OLD_STOCK_DAYS = 60;

function vnDayRange(offsetDays = 0) {
  const ymd = new Date(Date.now() + offsetDays * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const start = new Date(`${ymd}T00:00:00+07:00`);
  return { start, end: new Date(start.getTime() + 86400000) };
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000);
}

function vnMonthRange() {
  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  const [y, m] = ymd.split("-").map(Number);
  const start = new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+07:00`);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start, end: new Date(`${next}-01T00:00:00+07:00`), label: `${String(m).padStart(2, "0")}/${y}` };
}

export default async function OrchidDashboardPage() {
  const user = await requireOrchidStaffPage();
  const today = vnDayRange();
  const month = vnMonthRange();
  const oldCutoff = daysAgo(OLD_STOCK_DAYS);

  const [shippedToday, ordersToday, paymentsToday, retailSalesToday, retailPaymentsToday, lots, customerDebts, supplierDebts, points, pointSummaries, pending, expenses] =
    await Promise.all([
      prisma.orchidOrder.findMany({
        where: { status: { in: ORCHID_DELIVERED_STATUSES }, shippedAt: { gte: today.start, lt: today.end } },
        select: { total: true, items: { select: { quantity: true } } },
      }),
      prisma.orchidOrder.count({ where: { createdAt: { gte: today.start, lt: today.end }, status: { not: "CANCELLED" } } }),
      prisma.orchidCustomerPayment.aggregate({ where: { paymentDate: { gte: today.start, lt: today.end } }, _sum: { amount: true } }),
      prisma.orchidRetailSale.aggregate({ where: { saleDate: { gte: today.start, lt: today.end } }, _sum: { quantity: true, revenue: true } }),
      prisma.orchidRetailPayment.aggregate({ where: { paymentDate: { gte: today.start, lt: today.end } }, _sum: { amount: true } }),
      prisma.orchidLot.findMany({
        where: { quantityRemaining: { gt: 0 } },
        select: { code: true, quantityIn: true, quantityRemaining: true, unitCost: true, receivedDate: true, product: { select: { name: true } } },
      }),
      getAllOrchidCustomerDebts(prisma),
      getAllOrchidSupplierDebts(prisma),
      prisma.orchidRetailPoint.findMany({ where: { status: { not: "CLOSED" } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
      getOrchidPointSummaries(prisma),
      prisma.orchidOrder.groupBy({ by: ["status"], where: { status: { in: ["PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED", "PREPARING"] } }, _count: true }),
      user.isOrchidAdmin
        ? prisma.orchidExpense.findMany({ where: { expenseDate: { gte: month.start, lt: month.end } }, select: { amount: true, category: { select: { group: true, name: true } } } })
        : Promise.resolve([]),
    ]);

  const revenueToday = shippedToday.reduce((s, o) => s + o.total, 0) + (retailSalesToday._sum.revenue ?? 0);
  const plantsSoldToday = shippedToday.reduce((s, o) => s + o.items.reduce((a, i) => a + i.quantity, 0), 0) + (retailSalesToday._sum.quantity ?? 0);
  const collectedToday = (paymentsToday._sum.amount ?? 0) + (retailPaymentsToday._sum.amount ?? 0);
  const custDebts = [...customerDebts.values()];
  const suppDebts = [...supplierDebts.values()];
  const totalReceivable = custDebts.reduce((s, d) => s + Math.max(0, d.outstanding), 0);
  const totalOverdue = custDebts.reduce((s, d) => s + d.overdue, 0);
  const totalPayable = suppDebts.reduce((s, d) => s + Math.max(0, d.outstanding), 0);

  const totalPlants = lots.reduce((s, l) => s + l.quantityRemaining, 0);
  const stockValue = lots.reduce((s, l) => s + l.quantityRemaining * l.unitCost, 0);
  const oldLots = lots.filter((l) => l.receivedDate < oldCutoff);
  const lowLots = lots.filter((l) => l.quantityRemaining <= Math.max(10, l.quantityIn * 0.1));
  const pendingCount = (s: string) => pending.find((p) => p.status === s)?._count ?? 0;

  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const expenseBuy = expenses.filter((e) => e.category.group === "MUA_HANG").reduce((s, e) => s + e.amount, 0);
  const expenseSalary = expenses.filter((e) => e.category.name.toLowerCase().includes("lương")).reduce((s, e) => s + e.amount, 0);
  const expenseOps = expenses.filter((e) => e.category.group === "VAN_HANH" && !e.category.name.toLowerCase().includes("lương")).reduce((s, e) => s + e.amount, 0);
  const expenseOther = expenseTotal - expenseBuy - expenseSalary - expenseOps;

  return (
    <div className="space-y-6">
      <OrchidPageHeader title="Tổng quan" description="Số liệu hôm nay và tình hình kho, công nợ, điểm bán" />

      {(pendingCount("PENDING_APPROVAL") > 0 || pendingCount("CONFIRMED") > 0 || pendingCount("PREPARING") > 0) && (
        <Card className="border-warning">
          <CardContent className="p-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="font-semibold text-warning-foreground">Việc cần xử lý:</span>
            {pendingCount("PENDING_APPROVAL") > 0 && <Link className="text-info-foreground underline" href="/orchid/orders?status=PENDING_APPROVAL">{pendingCount("PENDING_APPROVAL")} đơn khách đặt chờ duyệt</Link>}
            {pendingCount("WAITING_CUSTOMER") > 0 && <Link className="text-info-foreground underline" href="/orchid/orders?status=WAITING_CUSTOMER">{pendingCount("WAITING_CUSTOMER")} đơn chờ khách xác nhận</Link>}
            {pendingCount("CONFIRMED") > 0 && <Link className="text-info-foreground underline" href="/orchid/orders?status=CONFIRMED">{pendingCount("CONFIRMED")} đơn chờ xuất kho</Link>}
            {pendingCount("PREPARING") > 0 && <Link className="text-info-foreground underline" href="/orchid/orders?status=PREPARING">{pendingCount("PREPARING")} đơn chờ giao</Link>}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <SectionTitle>Hôm nay</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Doanh thu" value={formatVND(revenueToday)} sub="Đơn đã giao + điểm bán" tone="primary" />
          <StatCard label="Số đơn mới" value={formatNumber(ordersToday)} />
          <StatCard label="Số cây bán" value={formatNumber(plantsSoldToday)} />
          <StatCard label="Tiền đã thu" value={formatVND(collectedToday)} tone="info" />
          <StatCard label="Tiền còn phải thu" value={formatVND(totalReceivable)} sub={totalOverdue > 0 ? `Quá hạn ${formatVND(totalOverdue)}` : undefined} tone={totalOverdue > 0 ? "danger" : "warning"} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Kho</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Tổng số cây" value={formatNumber(totalPlants)} />
          <StatCard label="Giá trị tồn kho (giá nhập)" value={formatVND(stockValue)} tone="primary" />
          <StatCard label={`Cây tồn lâu (> ${OLD_STOCK_DAYS} ngày)`} value={formatNumber(oldLots.reduce((s, l) => s + l.quantityRemaining, 0))} sub={`${oldLots.length} lô`} tone={oldLots.length ? "warning" : "default"} />
          <StatCard label="Lô hàng sắp hết" value={formatNumber(lowLots.length)} sub={lowLots.slice(0, 3).map((l) => `${l.code} (${l.quantityRemaining})`).join(", ") || undefined} tone={lowLots.length ? "warning" : "default"} />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Công nợ</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Khách đang nợ" value={formatNumber(custDebts.filter((d) => d.outstanding > 0.5).length)} />
          <StatCard label="Tổng phải thu" value={formatVND(totalReceivable)} tone="warning" />
          <StatCard label="NCC đang nợ" value={formatNumber(suppDebts.filter((d) => d.outstanding > 0.5).length)} />
          <StatCard label="Tổng phải trả" value={formatVND(totalPayable)} tone="danger" />
        </div>
      </section>

      <section className="space-y-3">
        <SectionTitle>Điểm bán</SectionTitle>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className={TH}>Điểm bán</th>
                  <th className={THR}>Doanh thu</th>
                  <th className={THR}>Đã bán</th>
                  <th className={THR}>Hỏng</th>
                  <th className={THR}>Tỷ lệ hỏng</th>
                  <th className={THR}>Tồn</th>
                </tr>
              </thead>
              <tbody>
                {points.length === 0 ? (
                  <EmptyRow colSpan={6} text="Chưa có điểm bán" />
                ) : (
                  points.map((p) => {
                    const s = pointSummaries.get(p.id);
                    const rate = s && s.received > 0 ? (s.damaged / s.received) * 100 : 0;
                    return (
                      <tr key={p.id} className={TR}>
                        <td className={TD}><Link href={`/orchid/retail-points/${p.id}`} className="font-medium hover:underline">{p.code} · {p.name}</Link></td>
                        <td className={TDR}>{formatVND(s?.revenue)}</td>
                        <td className={TDR}>{formatNumber(s?.sold)}</td>
                        <td className={TDR}>{formatNumber(s?.damaged)}</td>
                        <td className={TDR}>{rate.toFixed(1)}%</td>
                        <td className={TDR}>{formatNumber(s?.expectedStock)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {user.isOrchidAdmin && (
        <section className="space-y-3">
          <SectionTitle>Chi phí tháng {month.label}</SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard label="Tổng chi tháng" value={formatVND(expenseTotal)} tone="danger" />
            <StatCard label="Chi mua hàng" value={formatVND(expenseBuy)} />
            <StatCard label="Chi lương" value={formatVND(expenseSalary)} />
            <StatCard label="Chi vận hành" value={formatVND(expenseOps)} />
            <StatCard label="Chi khác" value={formatVND(expenseOther)} />
          </div>
        </section>
      )}
    </div>
  );
}
