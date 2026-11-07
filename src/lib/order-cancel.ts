import { prisma } from "@/lib/prisma";
import { releaseGardenAllocationsForOrders } from "@/lib/garden-inventory";
import { cancelOpenSupplierChecks, notifySupplierCheckManagers } from "@/lib/supplier-check-notify";

// Huỷ đơn: trả chỗ giữ (chỉ đổi status, không đụng Lot.quantity), huỷ Yêu cầu xử lý còn chờ, Đơn kiểm tra NCC chưa đặt hàng và
// phân bổ Vườn. cancelInvoices: đơn đã chuyển Đã xác nhận / Chưa cọc thì phiếu báo giá huỷ theo.
export async function cancelOrderRecords(orderId: string, byUserId: string, opts: { cancelInvoices?: boolean } = {}) {
  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } }),
    prisma.orderProcessingRequest.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELLED" } }),
    ...(opts.cancelInvoices ? [prisma.invoice.updateMany({ where: { orderId, status: { not: "CANCELLED" } }, data: { status: "CANCELLED" } })] : []),
  ]);
  await cancelOpenSupplierChecks([orderId]);
  await releaseGardenAllocationsForOrders([orderId], byUserId);
}

// NCC chưa có tài khoản không nhận được thông báo huỷ (xem notifySupplier), nên QL phải biết để báo NCC thôi giữ hàng.
export async function notifyManagersSaleCancelled(order: { id: string; code: string }, warehouseId: string | null | undefined) {
  await notifySupplierCheckManagers(
    `NV bán hàng đã huỷ đơn ${order.code}`,
    `Đơn ${order.code} đã huỷ sau khi QL phản hồi. Chỗ giữ và Đơn kiểm tra NCC chưa đặt hàng đã huỷ theo. NCC chưa có tài khoản thì QL báo NCC thôi giữ hàng.`,
    order.id,
    "Order",
    warehouseId
  );
}
