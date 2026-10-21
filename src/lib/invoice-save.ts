// Lưu invoice (tạo mới / sửa): kiểm tra phạm vi khách + đơn, tính lại trên server bằng dữ liệu đang áp dụng,
// chụp kết quả vào Invoice.result. Có giá nhập tay → PENDING_APPROVAL + báo Admin cấp cao; không → APPROVED.
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { computeInvoice, fmtMoney, type InvoiceResult } from "@/lib/invoice-engine";
import { invoiceSaveSchema, loadInvoiceContext, nextInvoiceNo, canViewAllInvoices } from "@/lib/invoice";
import { canSaleViewOrder } from "@/lib/customer-manager";

type SaveData = z.infer<typeof invoiceSaveSchema>;
type User = { id: string; role: string | null | undefined; name?: string | null };
type Out = { ok: true; id: string; status: string; invoiceNo: string } | { ok: false; status: number; message: string; blockers?: string[] };

export async function saveInvoice(user: User, data: SaveData, existingId: string | null): Promise<Out> {
  const allCustomers = canViewAllInvoices(user.role);

  let marketId = data.marketId;
  if (data.customerId) {
    const c = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true, marketId: true, assignedToId: true } });
    if (!c) return { ok: false, status: 400, message: "Không tìm thấy khách hàng" };
    if (!allCustomers && c.assignedToId !== user.id) return { ok: false, status: 403, message: "Khách hàng này không do bạn phụ trách" };
    marketId = c.marketId; // thị trường invoice = thị trường của khách
  }
  if (data.orderId) {
    const o = await prisma.order.findUnique({ where: { id: data.orderId }, select: { id: true, status: true, customerId: true, saleId: true } });
    if (!o) return { ok: false, status: 400, message: "Không tìm thấy đơn hàng" };
    if (!allCustomers && o.saleId !== user.id && !(await canSaleViewOrder(user.id, o.id))) return { ok: false, status: 403, message: "Không có quyền với đơn hàng này" };
    if (o.status !== "HELD" && o.status !== "DRAFT") return { ok: false, status: 400, message: "Chỉ gắn invoice cho đơn đang giữ (chưa xác nhận)" };
    if (o.customerId && data.customerId && o.customerId !== data.customerId) return { ok: false, status: 400, message: "Đơn hàng thuộc khách hàng khác" };
  }
  const profile = await prisma.companyProfile.findUnique({ where: { id: data.companyProfileId }, select: { isActive: true } });
  if (!profile?.isActive) return { ok: false, status: 400, message: "Thông tin công ty không hợp lệ" };

  const ctx = await loadInvoiceContext(marketId, data.invoiceDate);
  if (!ctx) return { ok: false, status: 400, message: "Không tìm thấy thị trường" };
  const result: InvoiceResult = computeInvoice(ctx, data.input);
  if (result.blockers.length) return { ok: false, status: 400, message: "Invoice còn lỗi — xử lý trước khi lưu", blockers: result.blockers };
  if (!result.items.length) return { ok: false, status: 400, message: "Invoice chưa có dòng hàng nào" };

  const status = result.hasManualPrice ? "PENDING_APPROVAL" : "APPROVED";
  const common = {
    invoiceDate: new Date(`${data.invoiceDate}T00:00:00.000Z`), marketId, currency: result.currency, priceListId: ctx.priceList?.id ?? null,
    customerId: data.customerId, customerName: data.customerName, customerAddress: data.customerAddress || null, customerEmail: data.customerEmail || null,
    orderId: data.orderId, companyProfileId: data.companyProfileId, note: data.note || null,
    input: data.input as object, result: result as unknown as object, total: result.total, hasManualPrice: result.hasManualPrice,
    status: status as "PENDING_APPROVAL" | "APPROVED",
    rejectionReason: null,
    decidedById: null, decidedAt: null,
  };

  let saved: { id: string; invoiceNo: string };
  if (existingId) {
    saved = await prisma.invoice.update({ where: { id: existingId }, data: common, select: { id: true, invoiceNo: true } });
  } else {
    // Trùng số khi 2 người lưu cùng lúc → thử lại số kế tiếp.
    let attempt = 0;
    for (;;) {
      try {
        saved = await prisma.invoice.create({ data: { ...common, invoiceNo: await nextInvoiceNo(), createdById: user.id }, select: { id: true, invoiceNo: true } });
        break;
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002" || ++attempt > 4) throw e;
      }
    }
  }

  if (status === "PENDING_APPROVAL") {
    await createAlert({
      type: "INVOICE_APPROVAL_NEEDED",
      title: `Invoice ${saved.invoiceNo} có giá nhập tay chờ duyệt`,
      message: `${user.name ?? "NV bán hàng"} lập invoice cho ${data.customerName} — tổng ${fmtMoney(result.total, result.currency)}.`,
      targetRole: "SUPER_ADMIN",
      relatedId: saved.id,
      relatedType: "Invoice",
    });
  }
  return { ok: true, id: saved.id, status, invoiceNo: saved.invoiceNo };
}
