import Link from "next/link";
import type { OrchidOrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { formatVND, formatDateVN, ORCHID_ORDER_STATUS_LABELS, ORCHID_ORDER_STATUS_VARIANT } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

const FILTERS: { key: string; label: string; statuses?: OrchidOrderStatus[] }[] = [
  { key: "open", label: "Đang xử lý", statuses: ["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED", "PREPARING", "SHIPPED"] },
  { key: "PENDING_APPROVAL", label: "Khách đặt chờ duyệt", statuses: ["PENDING_APPROVAL"] },
  { key: "WAITING_CUSTOMER", label: "Chờ khách xác nhận", statuses: ["WAITING_CUSTOMER"] },
  { key: "CONFIRMED", label: "Chờ xuất kho", statuses: ["CONFIRMED"] },
  { key: "PREPARING", label: "Chờ giao", statuses: ["PREPARING"] },
  { key: "SHIPPED", label: "Đã giao", statuses: ["SHIPPED"] },
  { key: "done", label: "Hoàn thành / trả hàng", statuses: ["COMPLETED", "RETURNED", "PARTIALLY_RETURNED"] },
  { key: "CANCELLED", label: "Đã huỷ", statuses: ["CANCELLED"] },
  { key: "all", label: "Tất cả" },
];

export default async function OrchidOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireOrchidStaffPage();
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];
  const where: Prisma.OrchidOrderWhereInput = {
    ...(filter.statuses ? { status: { in: filter.statuses } } : {}),
    ...(sp.q ? { OR: [{ code: { contains: sp.q, mode: "insensitive" } }, { customer: { name: { contains: sp.q, mode: "insensitive" } } }] } : {}),
  };
  const [orders, counts] = await Promise.all([
    prisma.orchidOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { customer: { select: { name: true, code: true } }, items: { select: { quantity: true } } },
    }),
    prisma.orchidOrder.groupBy({ by: ["status"], _count: true }),
  ]);
  const countFor = (f: (typeof FILTERS)[number]) =>
    f.statuses ? counts.filter((c) => f.statuses!.includes(c.status)).reduce((s, c) => s + c._count, 0) : counts.reduce((s, c) => s + c._count, 0);

  return (
    <div className="space-y-4">
      <OrchidPageHeader
        title="Đơn hàng"
        description="Khách tự đặt → Trợ lý duyệt (hoặc sửa số lượng, gửi lại khách xác nhận) → Xuất kho → Giao → Hoàn thành"
        actions={<Link href="/orchid/orders/new"><Button><Plus className="w-4 h-4 mr-1" />Tạo đơn hàng</Button></Link>}
      />
      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/orchid/orders?status=${f.key}`}
            className={cn("px-3 py-1.5 rounded-lg text-sm border", filter.key === f.key ? "bg-primary-light border-primary text-primary-strong font-semibold" : "border-divider text-text-secondary hover:bg-primary-light/50")}
          >
            {f.label} <span className="text-xs">({countFor(f)})</span>
          </Link>
        ))}
      </div>
      <form className="flex gap-2 max-w-md">
        <input type="hidden" name="status" value={filter.key} />
        <input name="q" defaultValue={sp.q} placeholder="Tìm mã đơn, tên khách…" className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm" />
        <button className="h-9 rounded-lg border border-border px-3 text-sm hover:bg-primary-light">Tìm</button>
      </form>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Mã đơn</th>
                <th className={TH}>Khách hàng</th>
                <th className={TH}>Ngày tạo</th>
                <th className={TH}>Người tạo</th>
                <th className={THR}>Số cây</th>
                <th className={THR}>Tổng tiền</th>
                <th className={TH}>Trạng thái</th>
                <th className={TH}>Hoá đơn</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <EmptyRow colSpan={8} text="Không có đơn hàng" />
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className={TR}>
                    <td className={TD}>
                      <Link href={`/orchid/orders/${o.id}`} className="font-mono text-info-foreground hover:underline">{o.code}</Link>
                      {o.source === "CUSTOMER" && <div><Badge variant="info" className="mt-0.5">Khách tự đặt</Badge></div>}
                    </td>
                    <td className={TD}>{o.customer.name}<div className="text-xs text-text-muted">{o.customer.code}</div></td>
                    <td className={TD}>{formatDateVN(o.createdAt)}</td>
                    <td className={TD}>{o.createdByName ?? "—"}</td>
                    <td className={TDR}>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                    <td className={`${TDR} font-semibold`}>{formatVND(o.total)}</td>
                    <td className={TD}><Badge variant={ORCHID_ORDER_STATUS_VARIANT[o.status]}>{ORCHID_ORDER_STATUS_LABELS[o.status]}</Badge></td>
                    <td className={TD}>{o.needInvoice ? <Badge variant="outline">VAT {o.vatRate}%</Badge> : "—"}</td>
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
