import { prisma } from "@/lib/prisma";
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

  // Phân bổ cây Vườn sản xuất (Nghiệp vụ 5) của đơn hết hạn — tự giải phóng phần chưa xuất về kho nguồn. Lịch sử
  // ghi theo NV bán hàng của đơn (không có người thao tác thật khi hệ thống tự huỷ).
  for (const o of expired) await releaseGardenAllocationsForOrders([o.id], o.saleId);
}
