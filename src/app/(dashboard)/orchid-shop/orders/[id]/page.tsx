import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrchidCustomerPage } from "@/lib/orchid/page-guard";
import {
  formatVND,
  formatNumber,
  formatDateVN,
  formatDateTimeVN,
  ORCHID_ORDER_STATUS_LABELS,
  ORCHID_ORDER_STATUS_VARIANT,
  ORCHID_INVOICE_STATUS_LABELS,
} from "@/lib/orchid/labels";
import { OrchidPageHeader } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import NoCustomerLinked from "../../no-customer";
import ShopOrderActions from "./shop-order-actions";

export default async function OrchidShopOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { customer } = await requireOrchidCustomerPage();
  if (!customer) return <NoCustomerLinked />;
  const { id } = await params;
  const order = await prisma.orchidOrder.findUnique({
    where: { id },
    include: { items: { include: { product: { select: { code: true, name: true, unit: true } } } } },
  });
  if (!order || order.customerId !== customer.id || order.status === "DRAFT") notFound();
  const changed = order.items.some((i) => i.quantity !== i.requestedQuantity);

  return (
    <div className="space-y-4">
      <Link href="/orchid-shop/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground"><ArrowLeft className="w-4 h-4" />Đơn hàng của tôi</Link>
      <OrchidPageHeader
        title={`Đơn hàng ${order.code}`}
        description={<span className="flex items-center gap-2"><Badge variant={ORCHID_ORDER_STATUS_VARIANT[order.status]}>{ORCHID_ORDER_STATUS_LABELS[order.status]}</Badge> Đặt lúc {formatDateTimeVN(order.createdAt)}</span>}
      />
      {order.status === "WAITING_CUSTOMER" && (
        <Card className="border-warning">
          <CardContent className="p-4 space-y-3">
            <p className="font-semibold text-warning-foreground">Nhân viên đã điều chỉnh đơn hàng — vui lòng xác nhận</p>
            {order.staffMessage && <p className="text-sm">Lời nhắn: {order.staffMessage}</p>}
            <ShopOrderActions orderId={order.id} mode="confirm" />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className={TH}>Sản phẩm</th>
                {changed && <th className={THR}>Bạn đặt</th>}
                <th className={THR}>{changed ? "Điều chỉnh" : "Số lượng"}</th>
                <th className={THR}>Đơn giá</th>
                <th className={THR}>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className={TR}>
                  <td className={TD}>{i.product.name}</td>
                  {changed && <td className={TDR}>{formatNumber(i.requestedQuantity)}</td>}
                  <td className={`${TDR} font-semibold ${changed && i.quantity !== i.requestedQuantity ? "text-warning-foreground" : ""}`}>{formatNumber(i.quantity)}</td>
                  <td className={TDR}>{formatVND(i.unitPrice)}</td>
                  <td className={TDR}>{formatVND(i.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-sm space-y-1">
            <div><span className="text-text-secondary">Giao tới: </span>{order.shippingAddress ?? "—"} · {order.phone ?? "—"}</div>
            {order.note && <div><span className="text-text-secondary">Ghi chú: </span>{order.note}</div>}
            {order.needInvoice && <div><span className="text-text-secondary">Hoá đơn: </span>{ORCHID_INVOICE_STATUS_LABELS[order.invoiceStatus]}{order.invoiceNumber && ` · Số ${order.invoiceNumber}`}</div>}
            {order.shippedAt && <div><span className="text-text-secondary">Ngày giao: </span>{formatDateVN(order.shippedAt)} · Hạn thanh toán {formatDateVN(order.dueDate)}</div>}
            {order.cancelReason && <div className="text-destructive">Đã huỷ: {order.cancelReason}</div>}
          </CardContent>
        </Card>
        <div className="rounded-lg bg-primary-light p-4 space-y-1.5 text-sm self-start">
          <div className="flex justify-between"><span>Tạm tính</span><span className="tabular-nums">{formatVND(order.subtotal)}</span></div>
          <div className="flex justify-between"><span>VAT {order.vatRate}%</span><span className="tabular-nums">{formatVND(order.vatAmount)}</span></div>
          <div className="flex justify-between font-bold text-primary-strong text-base"><span>Tổng cộng</span><span className="tabular-nums">{formatVND(order.total)}</span></div>
          {order.returnedAmount > 0 && <div className="flex justify-between text-destructive"><span>Hàng trả lại</span><span>−{formatVND(order.returnedAmount)}</span></div>}
        </div>
      </div>
      {order.status === "PENDING_APPROVAL" && <ShopOrderActions orderId={order.id} mode="cancel" />}
    </div>
  );
}
