import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canCreateInvoice, invoiceScopeFor } from "@/lib/invoice";
import type { InvoiceInput } from "@/lib/invoice-engine";
import InvoiceForm from "../../invoice-form";
import { loadInvoiceFormData, vnToday } from "../../form-data";

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(canCreateInvoice(role))) redirect("/dashboard");
  const { id } = await params;
  const inv = await prisma.invoice.findFirst({ where: { id, ...(await invoiceScopeFor(session.user)) }, include: { order: { select: { status: true } } } });
  if (!inv) notFound();
  const locked = inv.status === "CANCELLED" || (inv.order && !["HELD", "DRAFT", "CANCELLED"].includes(inv.order.status));
  if (locked || (inv.createdById !== session.user.id && role !== "SUPER_ADMIN")) redirect(`/invoices/${id}`);
  const data = await loadInvoiceFormData(session.user);
  // Đơn đang gắn có thể không còn trong danh sách đơn đang giữ của người sửa — vẫn giữ để không mất liên kết.
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/invoices/${id}`} className="text-sm text-text-secondary inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="w-4 h-4" /> {inv.invoiceNo}</Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2 mt-1"><Wallet className="w-6 h-6 text-primary-strong" /> Sửa phiếu báo giá {inv.invoiceNo}</h1>
      </div>
      <InvoiceForm
        {...data}
        today={vnToday()}
        presetOrderId={null}
        initial={{
          id: inv.id, invoiceNo: inv.invoiceNo, invoiceDate: inv.invoiceDate.toISOString().slice(0, 10), marketId: inv.marketId,
          customerId: inv.customerId, customerName: inv.customerName, customerAddress: inv.customerAddress, customerEmail: inv.customerEmail,
          orderId: inv.orderId, companyProfileId: inv.companyProfileId, note: inv.note, input: inv.input as unknown as InvoiceInput,
        }}
      />
    </div>
  );
}
