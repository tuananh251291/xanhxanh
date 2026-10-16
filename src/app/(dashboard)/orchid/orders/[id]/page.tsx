import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidAccountOptions } from "@/lib/orchid/queries";
import {
  formatVND,
  formatNumber,
  formatDateVN,
  formatDateTimeVN,
  ORCHID_ORDER_STATUS_LABELS,
  ORCHID_ORDER_STATUS_VARIANT,
  ORCHID_INVOICE_STATUS_LABELS,
  ORCHID_INVOICE_STATUS_VARIANT,
  ORCHID_PAYMENT_METHOD_LABELS,
  ORCHID_DELIVERED_STATUSES,
} from "@/lib/orchid/labels";
import { OrchidPageHeader, SectionTitle, EmptyRow } from "@/components/orchid/shared";
import { TH, THR, TD, TDR, TR } from "@/components/orchid/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PaymentDialog from "@/components/orchid/payment-dialog";
import OrderActions from "./order-actions";
import InvoiceDialog from "../../invoices/invoice-dialog";

export default async function OrchidOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrchidStaffPage();
  const { id } = await params;
  const order = await prisma.orchidOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: { select: { code: true, name: true, unit: true } },
          allocations: { include: { lot: { select: { code: true, receivedDate: true, warehouse: { select: { name: true } } } } } },
        },
      },
      payments: { orderBy: { paymentDate: "asc" }, include: { account: { select: { name: true } } } },
    },
  });
  if (!order) notFound();
  const accounts = await getOrchidAccountOptions();
  const delivered = ORCHID_DELIVERED_STATUSES.includes(order.status);
  const paid = order.payments.reduce((s, p) => s + p.amount, 0);
  const qtyChanged = order.source === "CUSTOMER" && order.items.some((i) => i.quantity !== i.requestedQuantity);

  return (
    <div className="space-y-5">
      <OrchidPageHeader
        title={`Đơn hàng ${order.code}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={ORCHID_ORDER_STATUS_VARIANT[order.status]}>{ORCHID_ORDER_STATUS_LABELS[order.status]}</Badge>
            {order.source === "CUSTOMER" && <Badge variant="info">Khách tự đặt</Badge>}
            <span>Tạo {formatDateTimeVN(order.createdAt)} bởi {order.createdByName ?? "—"}</span>
          </span>
        }
        actions={
          <>
            {delivered && (
              <PaymentDialog
                kind="customer"
                targetId={order.customerId}
                targetName={`${order.customer.name} — đơn ${order.code}`}
                accounts={accounts}
                docs={[{ id: order.id, label: `Đơn ${order.code}`, unpaid: order.total - order.returnedAmount - paid }]}
              />
            )}
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span className="text-text-secondary">Khách hàng: </span><Link href={`/orchid/customers/${order.customerId}`} className="font-medium hover:underline">{order.customer.name}</Link> <span className="text-xs text-text-muted">{order.customer.code}</span></div>
            <div><span className="text-text-secondary">Điện thoại: </span>{order.phone ?? "—"}</div>
            <div className="sm:col-span-2"><span className="text-text-secondary">Địa chỉ giao: </span>{order.shippingAddress ?? "—"}</div>
            {order.note && <div className="sm:col-span-2"><span className="text-text-secondary">Ghi chú: </span>{order.note}</div>}
            {order.internalNote && <div className="sm:col-span-2"><span className="text-text-secondary">Ghi chú nội bộ: </span>{order.internalNote}</div>}
            {order.staffMessage && <div className="sm:col-span-2"><span className="text-text-secondary">Lời nhắn gửi khách: </span>{order.staffMessage}</div>}
            {order.customerMessage && <div className="sm:col-span-2"><span className="text-text-secondary">Phản hồi của khách: </span>{order.customerMessage}</div>}
            {order.cancelReason && <div className="sm:col-span-2 text-destructive">Lý do huỷ: {order.cancelReason}</div>}
            <div><span className="text-text-secondary">Xác nhận: </span>{formatDateTimeVN(order.confirmedAt)}</div>
            <div><span className="text-text-secondary">Xuất kho: </span>{formatDateTimeVN(order.preparedAt)}</div>
            <div><span className="text-text-secondary">Giao hàng: </span>{formatDateTimeVN(order.shippedAt)}</div>
            <div><span className="text-text-secondary">Hạn thanh toán: </span>{formatDateVN(order.dueDate)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-3">
            <OrderActions
              orderId={order.id}
              status={order.status}
              items={order.items.map((i) => ({ id: i.id, name: i.product.name, quantity: i.quantity, returnedQuantity: i.returnedQuantity }))}
            />
          </CardContent>
        </Card>
      </div>

      <section className="space-y-2">
        <SectionTitle>Chi tiết hàng</SectionTitle>
        {qtyChanged && <p className="text-sm text-warning-foreground">Số lượng đã được điều chỉnh so với khách đặt ban đầu.</p>}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className={TH}>Sản phẩm</th>
                  {order.source === "CUSTOMER" && <th className={THR}>Khách đặt</th>}
                  <th className={THR}>Số lượng</th>
                  <th className={THR}>Đơn giá</th>
                  <th className={THR}>Thành tiền</th>
                  <th className={TH}>Xuất từ lô</th>
                  {order.items.some((i) => i.returnedQuantity > 0) && <th className={THR}>Đã trả</th>}
                </tr>
              </thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.id} className={TR}>
                    <td className={TD}>{i.product.name}<div className="text-xs font-mono text-info-foreground">{i.product.code}</div></td>
                    {order.source === "CUSTOMER" && <td className={TDR}>{formatNumber(i.requestedQuantity)}</td>}
                    <td className={`${TDR} font-semibold`}>{formatNumber(i.quantity)}</td>
                    <td className={TDR}>{formatVND(i.unitPrice)}</td>
                    <td className={TDR}>{formatVND(i.amount)}</td>
                    <td className={TD}>
                      {i.allocations.length === 0 ? (
                        <span className="text-xs text-text-muted">Chưa xuất kho</span>
                      ) : (
                        <div className="text-xs space-y-0.5">
                          {i.allocations.map((a) => (
                            <div key={a.id}><span className="font-mono">{a.lot.code}</span> ({formatDateVN(a.lot.receivedDate)}, {a.lot.warehouse.name}): {formatNumber(a.quantity)}{a.returnedQuantity > 0 && ` (trả ${a.returnedQuantity})`}</div>
                          ))}
                        </div>
                      )}
                    </td>
                    {order.items.some((x) => x.returnedQuantity > 0) && <td className={TDR}>{formatNumber(i.returnedQuantity)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <div className="w-full sm:w-80 rounded-lg bg-primary-light p-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><span>Tạm tính</span><span className="tabular-nums">{formatVND(order.subtotal)}</span></div>
            <div className="flex justify-between"><span>VAT {order.vatRate}%</span><span className="tabular-nums">{formatVND(order.vatAmount)}</span></div>
            <div className="flex justify-between font-bold text-primary-strong text-base"><span>Tổng cộng</span><span className="tabular-nums">{formatVND(order.total)}</span></div>
            {order.returnedAmount > 0 && <div className="flex justify-between text-destructive"><span>Hàng trả lại</span><span className="tabular-nums">−{formatVND(order.returnedAmount)}</span></div>}
            {delivered && (
              <>
                <div className="flex justify-between"><span>Đã thanh toán</span><span className="tabular-nums">{formatVND(paid)}</span></div>
                <div className="flex justify-between font-semibold"><span>Còn phải thu (đơn này)</span><span className="tabular-nums">{formatVND(order.total - order.returnedAmount - paid)}</span></div>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Hoá đơn</SectionTitle>
            <InvoiceDialog
              order={{
                id: order.id, code: order.code, needInvoice: order.needInvoice, invoiceStatus: order.invoiceStatus, invoiceCompanyName: order.invoiceCompanyName,
                invoiceTaxCode: order.invoiceTaxCode, invoiceAddress: order.invoiceAddress, invoiceEmail: order.invoiceEmail, invoiceNumber: order.invoiceNumber,
                invoiceDate: order.invoiceDate?.toISOString() ?? null, invoiceNote: order.invoiceNote,
              }}
            />
          </div>
          <Card>
            <CardContent className="p-4 text-sm space-y-1">
              {!order.needInvoice ? (
                <p className="text-text-muted">Đơn không xuất hoá đơn</p>
              ) : (
                <>
                  <Badge variant={ORCHID_INVOICE_STATUS_VARIANT[order.invoiceStatus]}>{ORCHID_INVOICE_STATUS_LABELS[order.invoiceStatus]}</Badge>
                  <div><span className="text-text-secondary">Đơn vị: </span>{order.invoiceCompanyName ?? "—"} · MST {order.invoiceTaxCode ?? "—"}</div>
                  <div><span className="text-text-secondary">Địa chỉ: </span>{order.invoiceAddress ?? "—"}</div>
                  <div><span className="text-text-secondary">Email nhận: </span>{order.invoiceEmail ?? "—"}</div>
                  <div><span className="text-text-secondary">Số HĐ: </span>{order.invoiceNumber ?? "—"} · Ngày xuất {formatDateVN(order.invoiceDate)} · Người xử lý {order.invoiceHandlerName ?? "—"}</div>
                  {order.invoiceNote && <div><span className="text-text-secondary">Ghi chú: </span>{order.invoiceNote}</div>}
                </>
              )}
            </CardContent>
          </Card>
        </section>
        <section className="space-y-2">
          <SectionTitle>Thanh toán của đơn</SectionTitle>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-light">
                    <th className={TH}>Ngày</th>
                    <th className={TH}>Phiếu thu</th>
                    <th className={TH}>Hình thức</th>
                    <th className={THR}>Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {order.payments.length === 0 ? (
                    <EmptyRow colSpan={4} text="Chưa có thanh toán gắn với đơn này" />
                  ) : (
                    order.payments.map((p) => (
                      <tr key={p.id} className={TR}>
                        <td className={TD}>{formatDateVN(p.paymentDate)}</td>
                        <td className={`${TD} font-mono`}>{p.code}</td>
                        <td className={TD}>{ORCHID_PAYMENT_METHOD_LABELS[p.method]}{p.account && <div className="text-xs text-text-muted">{p.account.name}</div>}</td>
                        <td className={TDR}>{formatVND(p.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
