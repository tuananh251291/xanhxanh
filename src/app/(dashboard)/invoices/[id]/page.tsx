import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canApproveInvoice, canCreateInvoice, canViewAllInvoices, invoiceScopeFor, loadInvoiceContext } from "@/lib/invoice";
import { invoiceApprovalSummary, type InvoiceInput, type InvoiceResult } from "@/lib/invoice-engine";
import { getInvoiceLock } from "@/lib/invoice-lock";
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
      order: { select: { id: true, code: true, status: true, customerCode: true, expectedShipAt: true } },
      customer: { select: { code: true } },
      companyProfile: true,
      createdBy: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
    },
  });
  if (!inv) notFound();
  const lock = await getInvoiceLock(inv);
  const isOwner = inv.createdBy.id === session.user.id;
  const canChange = (isOwner && canCreateInvoice(role)) || role === "SUPER_ADMIN";
  const invoiceDate = inv.invoiceDate.toISOString().slice(0, 10);
  const input = inv.input as unknown as InvoiceInput;
  const result = inv.result as unknown as InvoiceResult;

  // Giá gốc so theo đúng bảng giá phiếu đã dùng lúc lưu (null = lúc lưu chưa có bảng giá).
  const canApprove = canApproveInvoice(role);
  const ctx = canApprove && inv.hasManualPrice ? await loadInvoiceContext(inv.marketId, invoiceDate, undefined, inv.priceListId) : null;
  const approvalSummary = ctx ? invoiceApprovalSummary(ctx, input, result) : null;

  // Ngày xuất: theo đơn gắn với phiếu; phiếu Mỹ chưa gắn đơn lấy ngày chuyến hàng đã chọn.
  const shipDate = inv.order?.expectedShipAt
    ? inv.order.expectedShipAt.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : inv.market.invoiceCalcKind === "US" && input.us?.shipmentDate
      ? input.us.shipmentDate.split("-").reverse().join("/")
      : null;
  return (
    <InvoiceDetail
      invoice={{
        id: inv.id, invoiceNo: inv.invoiceNo, invoiceDate, status: inv.status,
        customerName: inv.customerName, customerAddress: inv.customerAddress, customerEmail: inv.customerEmail,
        marketName: inv.market.name, marketCode: inv.market.code, kind: inv.market.invoiceCalcKind,
        order: inv.order, note: inv.note, rejectionReason: inv.rejectionReason, hasManualPrice: inv.hasManualPrice,
        createdBy: inv.createdBy.name, createdAt: inv.createdAt.toISOString(), decidedBy: inv.decidedBy?.name ?? null, decidedAt: inv.decidedAt?.toISOString() ?? null,
        profile: inv.companyProfile ? { name: inv.companyProfile.name, address: inv.companyProfile.address, email: inv.companyProfile.email, phone: inv.companyProfile.phone, taxCode: inv.companyProfile.taxCode, bankInfo: inv.companyProfile.bankInfo } : null,
        result,
        customerCode: inv.customer?.code ?? inv.order?.customerCode ?? null, shipDate,
      }}
      approvalSummary={approvalSummary}
      canApprove={canApprove}
      canEdit={lock.canEdit && canChange}
      canCancel={lock.canCancel && canChange}
      canSend={lock.canSend && (role === "QUAN_LY_KHO_THANH_PHAM" || role === "SALE")}
      lockNotice={lock.notice}
    />
  );
}
