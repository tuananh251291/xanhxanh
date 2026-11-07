import { prisma } from "@/lib/prisma";
import { buildOrderInvoicePrefill, invoiceMatchesOrder } from "@/lib/order-pricing";
import type { InvoiceInput } from "@/lib/invoice-engine";

// Phiếu báo giá làm được gì ở từng bước của đơn. Bấm "Đã xác nhận / Chưa cọc" trên phiếu thì đơn sang QL Kho TP và phiếu khoá.
// QL đã phản hồi: Sale được huỷ, huỷ phiếu là huỷ luôn đơn (cancelsOrder). Đơn không còn khớp phiếu (NCC đáp ứng thiếu, QL sửa đơn) thì
// được sửa để cập nhật.
export type InvoiceLock = { canEdit: boolean; canCancel: boolean; cancelsOrder: boolean; canSend: boolean; notice: string | null };

const LOCKED: InvoiceLock = { canEdit: false, canCancel: false, cancelsOrder: false, canSend: false, notice: null };

export async function getInvoiceLock(inv: { status: string; orderId: string | null; input: unknown }): Promise<InvoiceLock> {
  if (inv.status === "CANCELLED") return LOCKED;
  if (!inv.orderId) {
    return { ...LOCKED, canEdit: true, canCancel: true, notice: "Phiếu độc lập chưa gửi Kho thành phẩm. Khách đồng ý thì tạo đơn hàng rồi lập phiếu từ đơn để gửi QL Kho TP." };
  }
  const order = await prisma.order.findUnique({
    where: { id: inv.orderId },
    select: { id: true, code: true, status: true, customerConfirmedAt: true, supplyResultSentAt: true },
  });
  if (!order) return LOCKED;
  if (order.status === "CANCELLED") return { ...LOCKED, canCancel: true, notice: `Đơn ${order.code} đã huỷ.` };
  if (order.status !== "HELD" && order.status !== "DRAFT") return { ...LOCKED, notice: `Đơn ${order.code} đã cọc — không sửa/huỷ phiếu được nữa.` };

  if (!order.customerConfirmedAt) {
    const approved = inv.status === "APPROVED";
    return {
      ...LOCKED, canEdit: true, canCancel: true, canSend: approved,
      notice: approved ? null : "Phiếu cần được duyệt mới chuyển Đã xác nhận / Chưa cọc được.",
    };
  }
  if (!order.supplyResultSentAt) return { ...LOCKED, notice: `Đơn ${order.code} đang chờ QL Kho TP phản hồi — chưa sửa/huỷ được.` };
  const replied = { ...LOCKED, canCancel: true, cancelsOrder: true };
  const prefill = await buildOrderInvoicePrefill(order.id);
  if (prefill && !invoiceMatchesOrder(inv.input as InvoiceInput, prefill)) {
    return { ...replied, canEdit: true, notice: `QL Kho TP đã phản hồi: số đáp ứng của đơn ${order.code} không còn khớp phiếu. Khách đồng ý thì bấm Sửa → Lấy lại dòng từ đơn rồi lưu trước khi ghi nhận cọc; khách không đồng ý thì huỷ đơn.` };
  }
  return { ...replied, notice: `QL Kho TP đã phản hồi đơn ${order.code}: phiếu không sửa được. Khách không đồng ý thì huỷ đơn, chỗ giữ và Đơn kiểm tra NCC huỷ theo.` };
}
