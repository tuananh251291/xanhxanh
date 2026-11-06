import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { cancelOpenSupplierChecks } from "@/lib/supplier-check-notify";
import { releaseGardenAllocationsForOrders } from "@/lib/garden-inventory";

// Không có tiến trình chạy nền (cron) trong app này — theo đúng pattern ở
// src/lib/instruction-lifecycle.ts. Đơn "Tạm giữ" (HELD) quá hạn holdUntil phải tự động CANCELLED để
// hoàn tồn đạt tiêu chuẩn; vì mọi phép tính tồn đạt tiêu chuẩn chỉ trừ đơn status HELD, chuyển sang CANCELLED là đủ
// để "hoàn tồn", không cần xoá OrderItem. Yêu cầu xử lý cây PENDING của đơn hết hạn cũng phải CANCELLED
// theo, tránh Kho thành phẩm hoàn thành 1 phiếu xử lý cho đơn đã chết (sẽ trừ oan tồn thực).
export async function ensureExpiredOrdersCancelled(): Promise<void> {
  const expired = await prisma.order.findMany({
    where: { status: "HELD", holdUntil: { lt: new Date() } },
    select: { id: true, saleId: true },
  });
  if (expired.length === 0) return;
  const expiredIds = expired.map((o) => o.id);

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: expiredIds } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    }),
    prisma.orderProcessingRequest.updateMany({
      where: { orderId: { in: expiredIds }, status: "PENDING" },
      data: { status: "CANCELLED" },
    }),
  ]);
  await cancelOpenSupplierChecks(expiredIds);

  // Phân bổ cây Vườn sản xuất (Nghiệp vụ 5) của đơn hết hạn — tự giải phóng phần chưa xuất về kho nguồn. Lịch sử
  // ghi theo NV bán hàng của đơn (không có người thao tác thật khi hệ thống tự huỷ).
  for (const o of expired) await releaseGardenAllocationsForOrders([o.id], o.saleId);
}

const HOLD_REMINDER_MS = 24 * 60 * 60 * 1000;

// Đơn chưa bấm "Khách xác nhận / Chưa cọc": báo Sale trước 1 ngày, mỗi đơn 1 lần. Chạy định kì ở src/instrumentation-node.ts.
export async function sendOrderHoldReminders(now: Date = new Date()): Promise<void> {
  const expiring = await prisma.order.findMany({
    where: { status: "HELD", customerConfirmedAt: null, holdUntil: { gt: now, lte: new Date(now.getTime() + HOLD_REMINDER_MS) } },
    select: { id: true, code: true, saleId: true, customerCode: true, holdUntil: true },
  });
  for (const order of expiring) {
    const already = await prisma.alert.findFirst({ where: { type: "ORDER_EXPIRING", relatedId: order.id }, select: { id: true } });
    if (already) continue;
    const at = order.holdUntil!.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });
    await createAlert({
      type: "ORDER_EXPIRING",
      title: `Đơn ${order.code} sắp bị huỷ`,
      message: `Đơn hàng ${order.code} (khách ${order.customerCode}) của bạn sẽ bị huỷ vào ${at}. Hãy thông báo lại với khách hàng.`,
      userId: order.saleId,
      relatedId: order.id,
      relatedType: "Order",
    });
  }
}
