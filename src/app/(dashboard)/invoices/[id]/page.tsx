import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canApproveInvoice, canCreateInvoice, canViewAllInvoices, invoiceScopeFor } from "@/lib/invoice";
import type { InvoiceResult } from "@/lib/invoice-engine";
import InvoiceDetail from "./invoice-detail";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(canCreateInvoice(role) || canViewAllInvoices(role))) redirect("/dashboard");
  const { id } = await params;
  const inv = await prisma.invoice.findFirst({
    where: { id, ...(await invoiceScopeFor(session.user)) },
    include: {
      market: { select: { code: true, name: true, invoiceCalcKind: true } },
      order: { select: { id: true, code: true, status: true } },
      companyProfile: true,
      createdBy: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
    },
  });
  if (!inv) notFound();
  const orderLocked = !!inv.order && !["HELD", "DRAFT", "CANCELLED"].includes(inv.order.status);
  const isOwner = inv.createdBy.id === session.user.id;
  return (
    <InvoiceDetail
      invoice={{
        id: inv.id, invoiceNo: inv.invoiceNo, invoiceDate: inv.invoiceDate.toISOString().slice(0, 10), status: inv.status,
        customerName: inv.customerName, customerAddress: inv.customerAddress, customerEmail: inv.customerEmail,
        marketName: inv.market.name, marketCode: inv.market.code, kind: inv.market.invoiceCalcKind,
        order: inv.order, note: inv.note, rejectionReason: inv.rejectionReason, hasManualPrice: inv.hasManualPrice,
        createdBy: inv.createdBy.name, createdAt: inv.createdAt.toISOString(), decidedBy: inv.decidedBy?.name ?? null, decidedAt: inv.decidedAt?.toISOString() ?? null,
        profile: inv.companyProfile ? { name: inv.companyProfile.name, address: inv.companyProfile.address, email: inv.companyProfile.email, phone: inv.companyProfile.phone, taxCode: inv.companyProfile.taxCode, bankInfo: inv.companyProfile.bankInfo } : null,
        result: inv.result as unknown as InvoiceResult,
      }}
      canApprove={canApproveInvoice(role)}
      canEdit={!orderLocked && inv.status !== "CANCELLED" && ((isOwner && canCreateInvoice(role)) || role === "SUPER_ADMIN")}
    />
  );
}
