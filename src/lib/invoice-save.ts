// Lưu invoice (tạo mới / sửa): kiểm tra phạm vi khách + đơn, tính lại trên server bằng dữ liệu đang áp dụng,
// chụp kết quả vào Invoice.result. Có giá nhập tay → PENDING_APPROVAL + báo Admin cấp cao; không → APPROVED.
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { computeInvoice, fmtMoney, type InvoiceInput, type InvoiceResult } from "@/lib/invoice-engine";
import { invoiceSaveSchema, loadInvoiceContext, nextInvoiceNo, canViewAllInvoices } from "@/lib/invoice";
import { canSaleViewOrder } from "@/lib/customer-manager";
import { dateToDateKey, vnDateKey } from "@/lib/price-list-shared";
import { buildOrderInvoicePrefill, invoiceMatchesOrder, syncOrderPricesFromInvoice } from "@/lib/order-pricing";

type SaveData = z.infer<typeof invoiceSaveSchema>;
type User = { id: string; role: string | null | undefined; name?: string | null };
type Out = { ok: true; id: string; status: string; invoiceNo: string } | { ok: false; status: number; message: string; blockers?: string[] };

// QL giảm số lượng sau khi đã phản hồi: phiếu của đơn tự theo số mới và tính lại bậc giá. Giữ nguyên trạng thái duyệt vì QL chỉ
// giảm số, giá đề xuất đã duyệt vẫn áp dụng. Số mới làm phiếu có lỗi (VD dưới số lượng tối thiểu) thì để nguyên, người gọi báo Sale.
export type InvoiceSyncResult = { ok: true; invoiceNo: string; before: string; after: string } | { ok: false; invoiceNo: string; reason: string };

export async function syncInvoiceFromOrder(orderId: string): Promise<InvoiceSyncResult | null> {
  const inv = await prisma.invoice.findFirst({
    where: { orderId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, invoiceNo: true, status: true, invoiceDate: true, marketId: true, total: true, currency: true, input: true, order: { select: { priceListId: true } } },
  });
  const prefill = inv ? await buildOrderInvoicePrefill(orderId) : null;
  if (!inv || !prefill) return null;

  const left = new Map(Object.entries(prefill.quantities));
  const follow = <T extends { orderKey?: string; qty: number }>(rows: T[]): T[] => rows.flatMap((row) => {
    if (!row.orderKey) return [row];
    const qty = left.get(row.orderKey);
    if (!qty) return [];
    left.delete(row.orderKey);
    return [{ ...row, qty }];
  });
  const old = inv.input as unknown as InvoiceInput;
  const input: InvoiceInput = { ...old, lines: follow(old.lines), manual: follow(old.manual) };
  if (left.size > 0) return { ok: false, invoiceNo: inv.invoiceNo, reason: "phiếu thiếu dòng so với đơn" };

  const ctx = await loadInvoiceContext(inv.marketId, dateToDateKey(inv.invoiceDate), undefined, inv.order?.priceListId);
  if (!ctx) return { ok: false, invoiceNo: inv.invoiceNo, reason: "không tìm thấy thị trường" };
  const result = computeInvoice(ctx, input);
  if (result.blockers.length > 0 || result.items.length === 0) {
    return { ok: false, invoiceNo: inv.invoiceNo, reason: result.blockers[0] ?? "phiếu không còn dòng hàng nào" };
  }
  await prisma.invoice.update({
    where: { id: inv.id },
    data: { input: input as object, result: result as unknown as object, total: result.total, hasManualPrice: result.hasManualPrice },
  });
  if (inv.status === "APPROVED") await syncOrderPricesFromInvoice(inv.id);
  return { ok: true, invoiceNo: inv.invoiceNo, before: fmtMoney(Number(inv.total), inv.currency), after: fmtMoney(result.total, result.currency) };
}

export async function saveInvoice(user: User, data: SaveData, existingId: string | null): Promise<Out> {
  const allCustomers = canViewAllInvoices(user.role);

  let marketId = data.marketId;
  // Ngày báo giá quyết định bảng giá của phiếu độc lập — chỉ Admin cấp cao chọn được, còn lại tạo mới là hôm nay, sửa giữ ngày cũ.
  let invoiceDate = data.invoiceDate;
  if (user.role !== "SUPER_ADMIN") {
    const existing = existingId ? await prisma.invoice.findUnique({ where: { id: existingId }, select: { invoiceDate: true } }) : null;
    invoiceDate = existing ? dateToDateKey(existing.invoiceDate) : vnDateKey();
  }
  // undefined = phiếu theo bảng giá của ngày báo giá; có giá trị = phiếu gắn đơn dùng đúng bảng đơn đã chốt lúc tạo.
  let orderPriceListId: string | null | undefined;
  if (data.customerId) {
    const c = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { id: true, marketId: true, assignedToId: true } });
    if (!c) return { ok: false, status: 400, message: "Không tìm thấy khách hàng" };
    if (!allCustomers && c.assignedToId !== user.id) return { ok: false, status: 403, message: "Khách hàng này không do bạn phụ trách" };
    marketId = c.marketId; // thị trường phiếu báo giá = thị trường của khách
  }
  if (data.orderId) {
    const o = await prisma.order.findUnique({ where: { id: data.orderId }, select: { id: true, status: true, customerId: true, saleId: true, pricedAt: true, priceListId: true, salesMarketId: true, customerConfirmedAt: true } });
    if (!o) return { ok: false, status: 400, message: "Không tìm thấy đơn hàng" };
    if (!allCustomers && o.saleId !== user.id && !(await canSaleViewOrder(user.id, o.id))) return { ok: false, status: 403, message: "Không có quyền với đơn hàng này" };
    if (o.status !== "HELD" && o.status !== "DRAFT") return { ok: false, status: 400, message: "Chỉ gắn phiếu báo giá cho đơn đang giữ (chưa xác nhận)" };
    if (o.customerId && data.customerId && o.customerId !== data.customerId) return { ok: false, status: 400, message: "Đơn hàng thuộc khách hàng khác" };
    if (!existingId && o.customerConfirmedAt && (await prisma.invoice.count({ where: { orderId: o.id, status: { not: "CANCELLED" } } })) > 0) {
      return { ok: false, status: 400, message: "Đơn đã chuyển Đã xác nhận / Chưa cọc và đã có phiếu báo giá — không lập thêm phiếu được" };
    }
    if (o.pricedAt && o.salesMarketId) {
      marketId = o.salesMarketId;
      orderPriceListId = o.priceListId;
      const prefill = await buildOrderInvoicePrefill(o.id);
      if (prefill && !invoiceMatchesOrder(data.input, prefill)) {
        return { ok: false, status: 400, message: "Dòng hàng của phiếu không khớp đơn (đơn có thể vừa được sửa) — bấm \"Lấy lại dòng từ đơn\" rồi lưu lại" };
      }
    }
  }
  const profile = await prisma.companyProfile.findUnique({ where: { id: data.companyProfileId }, select: { isActive: true } });
  if (!profile?.isActive) return { ok: false, status: 400, message: "Thông tin công ty không hợp lệ" };

  const ctx = await loadInvoiceContext(marketId, invoiceDate, undefined, orderPriceListId);
  if (!ctx) return { ok: false, status: 400, message: "Không tìm thấy thị trường" };
  const result: InvoiceResult = computeInvoice(ctx, data.input);
  if (result.blockers.length) return { ok: false, status: 400, message: "Phiếu báo giá còn lỗi — xử lý trước khi lưu", blockers: result.blockers };
  if (!result.items.length) return { ok: false, status: 400, message: "Phiếu báo giá chưa có dòng hàng nào" };

  const status = result.hasManualPrice ? "PENDING_APPROVAL" : "APPROVED";
  const common = {
    invoiceDate: new Date(`${invoiceDate}T00:00:00.000Z`), marketId, currency: result.currency, priceListId: ctx.priceList?.id ?? null,
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
      title: `Phiếu báo giá ${saved.invoiceNo} có giá đề xuất thay đổi chờ duyệt`,
      message: `${user.name ?? "NV bán hàng"} lập phiếu báo giá cho ${data.customerName} — tổng ${fmtMoney(result.total, result.currency)}.`,
      targetRole: "SUPER_ADMIN",
      relatedId: saved.id,
      relatedType: "Invoice",
    });
  }
  if (status === "APPROVED") await syncOrderPricesFromInvoice(saved.id);
  return { ok: true, id: saved.id, status, invoiceNo: saved.invoiceNo };
}
