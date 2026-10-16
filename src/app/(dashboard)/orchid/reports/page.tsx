import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getAllOrchidCustomerDebts, getAllOrchidSupplierDebts, getOrchidPointSummaries, parseDateVN, getOrchidStock } from "@/lib/orchid/server";
import { ORCHID_DELIVERED_STATUSES, formatVND, formatNumber, formatDateVN } from "@/lib/orchid/labels";
import { OrchidPageHeader, StatCard, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REPORTS = [
  { key: "sales", label: "Bán hàng" },
  { key: "stock", label: "Tồn kho" },
  { key: "debt", label: "Công nợ" },
  { key: "points", label: "Điểm bán" },
] as const;
const SALES_GROUPS = [
  { key: "day", label: "Theo ngày" },
  { key: "month", label: "Theo tháng" },
  { key: "customer", label: "Theo khách hàng" },
  { key: "product", label: "Theo sản phẩm" },
  { key: "staff", label: "Theo nhân viên" },
] as const;
const STOCK_GROUPS = [
  { key: "product", label: "Theo sản phẩm" },
  { key: "lot", label: "Theo lô" },
  { key: "warehouse", label: "Theo kho" },
] as const;
const DEBT_GROUPS = [
  { key: "customer", label: "Theo khách" },
  { key: "supplier", label: "Theo NCC" },
  { key: "overdue", label: "Quá hạn" },
] as const;

type SP = { r?: string; g?: string; from?: string; to?: string };

function defaultRange() {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export default async function OrchidReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireOrchidStaffPage(true);
  const sp = await searchParams;
  const report = REPORTS.find((r) => r.key === sp.r)?.key ?? "sales";
  const def = defaultRange();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : def.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : def.to;
  const groups = report === "sales" ? SALES_GROUPS : report === "stock" ? STOCK_GROUPS : report === "debt" ? DEBT_GROUPS : [];
  const group = groups.find((g) => g.key === sp.g)?.key ?? groups[0]?.key ?? "";
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams({ r: report, g: group, from, to, ...patch } as Record<string, string>);
    return `/orchid/reports?${p.toString()}`;
  };
  const usesRange = report === "sales" || report === "points";

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Báo cáo" description="Bán hàng · Tồn kho · Công nợ · Điểm bán" />
      <div className="flex gap-1 border-b border-divider">
        {REPORTS.map((r) => (
          <Link key={r.key} href={`/orchid/reports?r=${r.key}&from=${from}&to=${to}`} className={cn("px-3 py-2 text-sm rounded-t-lg", report === r.key ? "bg-primary-light text-primary-strong font-semibold" : "text-text-secondary hover:bg-primary-light/50")}>
            {r.label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <Link key={g.key} href={link({ g: g.key })} className={cn("px-3 py-1.5 rounded-lg text-sm border", group === g.key ? "bg-primary-light border-primary text-primary-strong font-semibold" : "border-divider text-text-secondary")}>
                {g.label}
              </Link>
            ))}
          </div>
        )}
        {usesRange && (
          <form className="flex items-end gap-2 ml-auto">
            <input type="hidden" name="r" value={report} />
            <input type="hidden" name="g" value={group} />
            <label className="text-xs space-y-1"><span className="block text-text-secondary">Từ ngày</span><input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" /></label>
            <label className="text-xs space-y-1"><span className="block text-text-secondary">Đến ngày</span><input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" /></label>
            <button className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-primary-light">Xem</button>
          </form>
        )}
      </div>
      {report === "sales" && <SalesReport group={group} from={from} to={to} />}
      {report === "stock" && <StockReport group={group} />}
      {report === "debt" && <DebtReport group={group} />}
      {report === "points" && <PointsReport from={from} to={to} />}
    </div>
  );
}

function Table({ head, rows, numericFrom = 1 }: { head: string[]; rows: (string | number)[][]; numericFrom?: number }) {
  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full">
          <thead><tr className="bg-primary-light">{head.map((h, i) => <th key={h} className={i >= numericFrom ? THR : TH}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <EmptyRow colSpan={head.length} /> : rows.map((r, i) => (
              <tr key={i} className={TR}>{r.map((c, j) => <td key={j} className={j >= numericFrom ? TDR : TD}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

async function SalesReport({ group, from, to }: { group: string; from: string; to: string }) {
  const start = parseDateVN(from);
  const end = new Date(parseDateVN(to).getTime() + 86400000);
  const items = await prisma.orchidOrderItem.findMany({
    where: { order: { status: { in: ORCHID_DELIVERED_STATUSES }, shippedAt: { gte: start, lt: end } } },
    select: {
      quantity: true, returnedQuantity: true, unitPrice: true, orderId: true,
      product: { select: { code: true, name: true } },
      order: { select: { shippedAt: true, createdByName: true, source: true, customer: { select: { code: true, name: true } } } },
    },
  });
  const key = (i: (typeof items)[number]): string => {
    const d = i.order.shippedAt!.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    if (group === "day") return d;
    if (group === "month") return d.slice(0, 7);
    if (group === "customer") return `${i.order.customer.code} · ${i.order.customer.name}`;
    if (group === "product") return `${i.product.code} · ${i.product.name}`;
    return i.order.source === "CUSTOMER" ? `${i.order.createdByName ?? "—"} (khách tự đặt)` : i.order.createdByName ?? "—";
  };
  const map = new Map<string, { qty: number; revenue: number; orders: Set<string> }>();
  for (const i of items) {
    const k = key(i);
    const row = map.get(k) ?? { qty: 0, revenue: 0, orders: new Set<string>() };
    const net = i.quantity - i.returnedQuantity;
    row.qty += net;
    row.revenue += net * i.unitPrice;
    row.orders.add(i.orderId);
    map.set(k, row);
  }
  const sorted = [...map.entries()].sort((a, b) => (group === "day" || group === "month" ? a[0].localeCompare(b[0]) : b[1].revenue - a[1].revenue));
  const label = (k: string) => (group === "day" ? formatDateVN(parseDateVN(k)) : group === "month" ? `${k.slice(5, 7)}/${k.slice(0, 4)}` : k);
  const totalRevenue = sorted.reduce((s, [, r]) => s + r.revenue, 0);
  const totalQty = sorted.reduce((s, [, r]) => s + r.qty, 0);
  const [retail] = await Promise.all([prisma.orchidRetailSale.aggregate({ where: { saleDate: { gte: start, lt: end } }, _sum: { quantity: true, revenue: true } })]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Doanh thu đơn hàng (chưa VAT, trừ hàng trả)" value={formatVND(totalRevenue)} tone="primary" />
        <StatCard label="Số cây bán qua đơn" value={formatNumber(totalQty)} />
        <StatCard label="Doanh thu điểm bán lẻ" value={formatVND(retail._sum.revenue)} />
        <StatCard label="Số cây bán tại điểm" value={formatNumber(retail._sum.quantity)} />
      </div>
      <Table
        head={[SALES_GROUPS.find((g) => g.key === group)?.label.replace("Theo ", "").replace(/^./, (c) => c.toUpperCase()) ?? "", "Số đơn", "Số cây", "Doanh thu"]}
        rows={sorted.map(([k, r]) => [label(k), formatNumber(r.orders.size), formatNumber(r.qty), formatVND(r.revenue)])}
      />
    </div>
  );
}

async function StockReport({ group }: { group: string }) {
  const lots = await prisma.orchidLot.findMany({
    where: { quantityRemaining: { gt: 0 } },
    orderBy: [{ receivedDate: "asc" }],
    include: { product: { select: { code: true, name: true } }, warehouse: { select: { name: true } }, supplier: { select: { name: true } } },
  });
  const stock = await getOrchidStock(prisma);
  const total = lots.reduce((s, l) => s + l.quantityRemaining, 0);
  const value = lots.reduce((s, l) => s + l.quantityRemaining * l.unitCost, 0);
  let content: React.ReactNode;
  if (group === "lot") {
    content = (
      <Table
        numericFrom={4}
        head={["Mã lô", "Sản phẩm", "Kho", "Ngày nhập", "SL nhập", "SL còn", "Giá trị còn"]}
        rows={lots.map((l) => [l.code, l.product.name, l.warehouse.name, formatDateVN(l.receivedDate), formatNumber(l.quantityIn), formatNumber(l.quantityRemaining), formatVND(l.quantityRemaining * l.unitCost)])}
      />
    );
  } else {
    const keyOf = (l: (typeof lots)[number]) => (group === "warehouse" ? l.warehouse.name : `${l.product.code} · ${l.product.name}`);
    const map = new Map<string, { qty: number; value: number; lots: number; productId: string }>();
    for (const l of lots) {
      const k = keyOf(l);
      const r = map.get(k) ?? { qty: 0, value: 0, lots: 0, productId: l.productId };
      r.qty += l.quantityRemaining;
      r.value += l.quantityRemaining * l.unitCost;
      r.lots += 1;
      map.set(k, r);
    }
    content =
      group === "warehouse" ? (
        <Table head={["Kho", "Số lô", "Số cây", "Giá trị"]} rows={[...map.entries()].map(([k, r]) => [k, r.lots, formatNumber(r.qty), formatVND(r.value)])} />
      ) : (
        <Table
          head={["Sản phẩm", "Số lô", "Tồn thực", "Giữ cho đơn", "Khả dụng", "Giá trị"]}
          rows={[...map.entries()].map(([k, r]) => {
            const s = stock.get(r.productId);
            return [k, r.lots, formatNumber(r.qty), formatNumber(s?.reserved), formatNumber(s?.available), formatVND(r.value)];
          })}
        />
      );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Tổng tồn" value={`${formatNumber(total)} cây`} tone="primary" />
        <StatCard label="Giá trị tồn (giá nhập)" value={formatVND(value)} />
        <StatCard label="Số lô còn hàng" value={formatNumber(lots.length)} />
      </div>
      {content}
    </div>
  );
}

async function DebtReport({ group }: { group: string }) {
  if (group === "supplier") {
    const [suppliers, debts] = await Promise.all([prisma.orchidSupplier.findMany({ select: { id: true, code: true, name: true } }), getAllOrchidSupplierDebts(prisma)]);
    const rows = suppliers.filter((s) => debts.has(s.id)).map((s) => ({ s, d: debts.get(s.id)! })).sort((a, b) => b.d.outstanding - a.d.outstanding);
    return <Table head={["Nhà cung cấp", "Phải trả", "Đã trả", "Còn phải trả", "Quá hạn", "Đến hạn"]} rows={rows.map(({ s, d }) => [`${s.code} · ${s.name}`, formatVND(d.totalReceivable), formatVND(d.paid), formatVND(d.outstanding), formatVND(d.overdue), formatDateVN(d.nextDueDate)])} />;
  }
  const [customers, debts] = await Promise.all([prisma.orchidCustomer.findMany({ select: { id: true, code: true, name: true, creditLimit: true } }), getAllOrchidCustomerDebts(prisma)]);
  let rows = customers.filter((c) => debts.has(c.id)).map((c) => ({ c, d: debts.get(c.id)! }));
  if (group === "overdue") rows = rows.filter((r) => r.d.overdue > 0.5);
  rows.sort((a, b) => (group === "overdue" ? b.d.overdue - a.d.overdue : b.d.outstanding - a.d.outstanding));
  return (
    <Table
      head={["Khách hàng", "Tổng phải thu", "Đã thu", "Còn nợ", "Quá hạn", "Hạn mức"]}
      rows={rows.map(({ c, d }) => [`${c.code} · ${c.name}`, formatVND(d.totalReceivable), formatVND(d.paid), formatVND(d.outstanding), formatVND(d.overdue), c.creditLimit == null ? "—" : formatVND(c.creditLimit)])}
    />
  );
}

async function PointsReport({ from, to }: { from: string; to: string }) {
  const start = parseDateVN(from);
  const end = new Date(parseDateVN(to).getTime() + 86400000);
  const [points, summaries, sent, sales, damages] = await Promise.all([
    prisma.orchidRetailPoint.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    getOrchidPointSummaries(prisma),
    prisma.orchidTransfer.groupBy({ by: ["pointId"], where: { type: "TO_POINT", status: { not: "CANCELLED" }, transferDate: { gte: start, lt: end } }, _sum: { quantity: true } }),
    prisma.orchidRetailSale.groupBy({ by: ["pointId"], where: { saleDate: { gte: start, lt: end } }, _sum: { quantity: true, revenue: true } }),
    prisma.orchidRetailDamage.groupBy({ by: ["pointId"], where: { damageDate: { gte: start, lt: end } }, _sum: { quantity: true } }),
  ]);
  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">Số gửi / bán / hỏng / doanh thu tính trong khoảng ngày đã chọn; Tồn là tồn sổ sách hiện tại.</p>
      <Table
        head={["Điểm bán", "Số cây gửi", "Số cây bán", "Số cây hỏng", "Tỷ lệ hỏng", "Tồn hiện tại", "Doanh thu"]}
        rows={points.map((p) => {
          const g = sent.find((x) => x.pointId === p.id)?._sum.quantity ?? 0;
          const s = sales.find((x) => x.pointId === p.id)?._sum;
          const d = damages.find((x) => x.pointId === p.id)?._sum.quantity ?? 0;
          return [`${p.code} · ${p.name}`, formatNumber(g), formatNumber(s?.quantity), formatNumber(d), g > 0 ? `${((d / g) * 100).toFixed(1)}%` : "—", formatNumber(summaries.get(p.id)?.expectedStock), formatVND(s?.revenue)];
        })}
      />
    </div>
  );
}
