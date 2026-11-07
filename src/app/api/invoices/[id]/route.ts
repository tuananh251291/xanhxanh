import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { canApproveInvoice, canCreateInvoice, invoiceSaveSchema, invoiceScopeFor } from "@/lib/invoice";
import { saveInvoice } from "@/lib/invoice-save";
import { buildOrderInvoicePrefill, clearOrderManualPrices, invoiceMatchesOrder, syncOrderPricesFromInvoice } from "@/lib/order-pricing";
import { getInvoiceLock } from "@/lib/invoice-lock";
import { notifySupplierCheckManagers } from "@/lib/supplier-check-notify";
import { cancelOrderRecords, notifyManagersSaleCancelled } from "@/lib/order-cancel";
import type { InvoiceInput } from "@/lib/invoice-engine";

async function findVisible(id: string, user: { id: string; role: string | null | undefined }) {
  return prisma.invoice.findFirst({
    where: { id, ...(await invoiceScopeFor(user)) },
    include: {
      market: { select: { id: true, code: true, name: true, currency: true, derivedCurrency: true, invoiceCalcKind: true } },
      order: { select: { id: true, code: true, status: true, saleId: true, sale: { select: { workplaceWarehouseId: true } } } },
      companyProfile: true,
      createdBy: { select: { id: true, name: true } },
      decidedBy: { select: { name: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  const inv = await findVisible(id, session.user);
  if (!inv) return NextResponse.json({ message: "Không tìm thấy phiếu báo giá" }, { status: 404 });
  return NextResponse.json(inv);
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), data: invoiceSaveSchema }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(1, "Nhập lý do từ chối").max(500) }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("send-to-manager") }),
]);

// update: người lập sửa (khoá theo getInvoiceLock) — tính lại, có giá tay thì chờ duyệt lại.
// send-to-manager: "Đã xác nhận / Chưa cọc": đơn sang QL Kho TP kiểm tra đáp ứng (src/lib/supplier-check.ts), phiếu khoá.
// approve/reject: Admin cấp cao duyệt giá nhập tay. cancel: người lập / Admin cấp cao huỷ; đơn đã chuyển thì khoá tới khi QL phản hồi, sau đó huỷ phiếu là huỷ luôn đơn.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  const parsed = actionSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const inv = await findVisible(id, session.user);
  if (!inv) return NextResponse.json({ message: "Không tìm thấy phiếu báo giá" }, { status: 404 });
  const body = parsed.data;

  if (body.action === "approve" || body.action === "reject") {
    if (!canApproveInvoice(session.user.role)) return NextResponse.json({ message: "Chỉ Admin cấp cao được duyệt" }, { status: 403 });
    const done = await prisma.invoice.updateMany({
      where: { id, status: "PENDING_APPROVAL", updatedAt: inv.updatedAt },
      data: {
        status: body.action === "approve" ? "APPROVED" : "REJECTED", decidedById: session.user.id, decidedAt: new Date(),
        rejectionReason: body.action === "reject" ? body.reason : null,
      },
    });
    if (done.count === 0) return NextResponse.json({ message: "Phiếu báo giá đã được xử lý hoặc vừa bị sửa — tải lại trang" }, { status: 409 });
    if (body.action === "approve") await syncOrderPricesFromInvoice(id);
    await createAlert({
      type: "INVOICE_DECIDED",
      title: body.action === "approve" ? `Phiếu báo giá ${inv.invoiceNo} đã được duyệt giá` : `Phiếu báo giá ${inv.invoiceNo} bị từ chối`,
      message: body.action === "approve" ? `Có thể in PDF${inv.order ? " và xác nhận đơn " + inv.order.code : ""}.` : `Lý do: ${body.reason} — sửa lại giá rồi lưu để gửi duyệt lại.`,
      userId: inv.createdBy.id,
      relatedId: id,
      relatedType: "Invoice",
    });
    return NextResponse.json({ success: true });
  }

  const isOwner = inv.createdBy.id === session.user.id;
  const lock = await getInvoiceLock(inv);

  if (body.action === "send-to-manager") {
    const order = inv.orderId
      ? await prisma.order.findUnique({ where: { id: inv.orderId }, select: { id: true, code: true, saleId: true, holdUntil: true, sale: { select: { workplaceWarehouseId: true } }, _count: { select: { shortages: true } } } })
      : null;
    const role = session.user.role;
    const allowed = role === "QUAN_LY_KHO_THANH_PHAM" || (role === "SALE" && (isOwner || order?.saleId === session.user.id));
    if (!allowed) return NextResponse.json({ message: "Chỉ NV bán hàng của đơn hoặc QL Kho TP được chuyển trạng thái" }, { status: 403 });
    if (!order) return NextResponse.json({ message: "Phiếu chưa gắn đơn — tạo đơn hàng rồi lập phiếu từ đơn" }, { status: 400 });
    if (!lock.canSend) return NextResponse.json({ message: lock.notice ?? "Phiếu không chuyển trạng thái được" }, { status: 400 });
    if (order.holdUntil && order.holdUntil < new Date()) return NextResponse.json({ message: "Đơn đã quá hạn xác nhận và bị huỷ — tạo lại đơn" }, { status: 400 });
    const prefill = await buildOrderInvoicePrefill(order.id);
    if (prefill && !invoiceMatchesOrder(inv.input as unknown as InvoiceInput, prefill)) {
      return NextResponse.json({ message: "Phiếu không khớp đơn (đơn có thể vừa được sửa) — bấm Sửa → Lấy lại dòng từ đơn rồi lưu lại" }, { status: 400 });
    }
    const done = await prisma.order.updateMany({ where: { id: order.id, status: "HELD", customerConfirmedAt: null }, data: { customerConfirmedAt: new Date(), holdUntil: null } });
    if (done.count === 0) return NextResponse.json({ message: "Đơn đã được chuyển trạng thái — tải lại trang" }, { status: 409 });
    await notifySupplierCheckManagers(
      `Đơn ${order.code}: đã xác nhận, chưa cọc`,
      `${order._count.shortages > 0 ? "Đơn thiếu hàng — cần gửi Đơn kiểm tra cho NCC" : "Đơn đủ hàng — kiểm tra lại"} rồi gửi kết quả cho NV bán hàng trong 1 ngày làm việc, xem trang Kiểm tra NCC`,
      order.id,
      "Order",
      order.sale.workplaceWarehouseId
    );
    return NextResponse.json({ success: true });
  }

  if (!(isOwner && canCreateInvoice(session.user.role)) && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ người lập phiếu báo giá được sửa/huỷ" }, { status: 403 });
  }
  if (inv.status === "CANCELLED") return NextResponse.json({ message: "Phiếu báo giá đã huỷ" }, { status: 400 });
  if (!(body.action === "cancel" ? lock.canCancel : lock.canEdit)) {
    return NextResponse.json({ message: lock.notice ?? "Phiếu báo giá đã khoá — không sửa/huỷ được nữa" }, { status: 400 });
  }

  if (body.action === "cancel" && lock.cancelsOrder && inv.order) {
    if (session.user.role === "SALE" && inv.order.saleId !== session.user.id) {
      return NextResponse.json({ message: "Chỉ được huỷ đơn hàng của chính mình" }, { status: 403 });
    }
    await cancelOrderRecords(inv.order.id, session.user.id, { cancelInvoices: true });
    await notifyManagersSaleCancelled(inv.order, inv.order.sale.workplaceWarehouseId);
    return NextResponse.json({ success: true });
  }
  if (body.action === "cancel") {
    await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    if (inv.orderId && inv.status === "APPROVED") await clearOrderManualPrices(inv.orderId);
    return NextResponse.json({ success: true });
  }
  const out = await saveInvoice(session.user, body.data, id);
  if (!out.ok) return NextResponse.json({ message: out.message, blockers: out.blockers }, { status: out.status });
  return NextResponse.json(out);
}
