import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaffPage } from "@/lib/orchid/page-guard";
import { getOrchidOrderFormData } from "@/lib/orchid/queries";
import { OrchidPageHeader } from "@/components/orchid/shared";
import OrchidOrderForm from "../../order-form";

export default async function EditOrchidOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOrchidStaffPage();
  const { id } = await params;
  const order = await prisma.orchidOrder.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();
  if (!["DRAFT", "PENDING_APPROVAL", "WAITING_CUSTOMER", "CONFIRMED"].includes(order.status)) redirect(`/orchid/orders/${id}`);
  const data = await getOrchidOrderFormData();
  // Khách đã ngừng giao dịch vẫn phải hiện trong danh sách chọn của đơn cũ.
  if (!data.customers.some((c) => c.id === order.customerId)) {
    const c = await prisma.orchidCustomer.findUniqueOrThrow({
      where: { id: order.customerId },
      select: { id: true, code: true, name: true, address: true, phone: true, companyName: true, taxCode: true, invoiceAddress: true, invoiceEmail: true },
    });
    data.customers.push(c);
  }
  return (
    <div className="space-y-4">
      <OrchidPageHeader
        title={`Sửa đơn ${order.code}`}
        description={order.status === "PENDING_APPROVAL" ? "Sau khi sửa số lượng, quay lại đơn và bấm \"Gửi lại khách xác nhận\"" : undefined}
      />
      <OrchidOrderForm
        {...data}
        orderId={order.id}
        initial={{
          customerId: order.customerId,
          shippingAddress: order.shippingAddress ?? "",
          phone: order.phone ?? "",
          note: order.note ?? "",
          internalNote: order.internalNote ?? "",
          needInvoice: order.needInvoice,
          vatRate: order.vatRate,
          items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
        }}
      />
    </div>
  );
}
