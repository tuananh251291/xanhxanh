import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrchidCustomerPage } from "@/lib/orchid/page-guard";
import { formatVND, formatDateVN, ORCHID_ORDER_STATUS_LABELS, ORCHID_ORDER_STATUS_VARIANT } from "@/lib/orchid/labels";
import { OrchidPageHeader, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NoCustomerLinked from "../no-customer";

export default async function OrchidShopOrdersPage() {
  const { customer } = await requireOrchidCustomerPage();
  if (!customer) return <NoCustomerLinked />;
  const orders = await prisma.orchidOrder.findMany({
    where: { customerId: customer.id, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    include: { items: { select: { quantity: true } } },
  });
  const waiting = orders.filter((o) => o.status === "WAITING_CUSTOMER");

  return (
    <div className="space-y-4">
      <OrchidPageHeader title="Đơn hàng của tôi" />
      {waiting.length > 0 && (
        <Card className="border-warning">
          <CardContent className="p-4 text-sm">
            <span className="font-semibold text-warning-foreground">Có {waiting.length} đơn nhân viên đã điều chỉnh, cần bạn xác nhận: </span>
            {waiting.map((o) => <Link key={o.id} href={`/orchid-shop/orders/${o.id}`} className="underline text-info-foreground mr-2">{o.code}</Link>)}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Mã đơn</th>
                <th className={TH}>Ngày đặt</th>
                <th className={THR}>Số cây</th>
                <th className={THR}>Tổng tiền</th>
                <th className={TH}>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <EmptyRow colSpan={5} text="Bạn chưa có đơn hàng nào" />
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className={TR}>
                    <td className={TD}><Link href={`/orchid-shop/orders/${o.id}`} className="font-mono text-info-foreground hover:underline">{o.code}</Link></td>
                    <td className={TD}>{formatDateVN(o.createdAt)}</td>
                    <td className={TDR}>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                    <td className={`${TDR} font-semibold`}>{formatVND(o.total)}</td>
                    <td className={TD}><Badge variant={ORCHID_ORDER_STATUS_VARIANT[o.status]}>{ORCHID_ORDER_STATUS_LABELS[o.status]}</Badge></td>
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
