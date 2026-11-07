import { prisma } from "@/lib/prisma";
import { buildOrderInvoicePrefill, invoiceMatchesOrder } from "@/lib/order-pricing";
import type { InvoiceInput } from "@/lib/invoice-engine";

// Phiếu báo giá làm được gì ở từng bước của đơn. Bấm "Đã xác nhận / Chưa cọc" trên phiếu thì đơn sang QL Kho TP và phiếu khoá.
// Ngoại lệ: QL đã phản hồi mà đơn không còn khớp phiếu (thêm phần NCC đáp ứng, QL sửa đơn) thì Sale được sửa để cập nhật, không được huỷ.
export type InvoiceLock = { canEdit: boolean; canCancel: boolean; canSend: boolean; notice: string | null };

const LOCKED: InvoiceLock = { canEdit: false, canCancel: false, canSend: false, notice: null };

export async function getInvoiceLock(inv: { status: string; orderId: string | null; input: unknown }): Promise<InvoiceLock> {
  if (inv.status === "CANCELLED") return LOCKED;
  if (!inv.orderId) {
    return { canEdit: true, canCancel: true, canSend: false, notice: "Phiếu độc lập chưa gửi Kho thành phẩm. Khách đồng ý thì tạo đơn hàng rồi lập phiếu từ đơn để gửi QL Kho TP." };
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
      canEdit: true, canCancel: true, canSend: approved,
      notice: approved ? null : "Phiếu cần được duyệt mới chuyển Đã xác nhận / Chưa cọc được.",
    };
  }
  if (order.supplyResultSentAt) {
    const prefill = await buildOrderInvoicePrefill(order.id);
    if (prefill && !invoiceMatchesOrder(inv.input as InvoiceInput, prefill)) {
      return { canEdit: true, canCancel: false, canSend: false, notice: `QL Kho TP đã phản hồi: số đáp ứng của đơn ${order.code} không còn khớp phiếu. Bấm Sửa → Lấy lại dòng từ đơn rồi lưu trước khi ghi nhận cọc.` };
    }
  }
  return { ...LOCKED, notice: `Phiếu đã chuyển Đã xác nhận / Chưa cọc, đơn ${order.code} đã gửi QL Kho TP — không sửa/huỷ được nữa.` };
}
