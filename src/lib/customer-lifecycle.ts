import { format, getDate, getDaysInMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";

// Không có tiến trình chạy nền (cron) trong app này — theo đúng pattern ở src/lib/order-lifecycle.ts.
// Khách "Đã phân công" nhưng sau 2 tháng kể từ Ngày đầu tiếp cận vẫn chưa có Ngày ra đơn/Mã đơn gần nhất
// (chưa từng cập nhật) thì tự động thu hồi — chuyển về "Chưa phân công" và xoá NV phụ trách, để NV khác
// có thể đăng ký lại (xem POST /api/customer-check/register). Idempotent tự nhiên: sau khi revert, where
// không còn khớp customer đó nữa. CHỈ where status: DA_PHAN_CONG — khách "Mặc định" (MAC_DINH) KHÔNG bao
// giờ bị thu hồi dù không có đơn, đúng ý nghĩa "gắn cố định với NV" (xem CustomerStatus, schema.prisma).
export async function ensureCustomerAutoExpire(): Promise<void> {
  await prisma.customer.updateMany({
    where: {
      status: "DA_PHAN_CONG",
      lastOrderAt: null,
      lastOrderCode: null,
      firstContactAt: { lt: subMonths(new Date(), 2) },
    },
    data: { status: "CHUA_PHAN_CONG", assignedToId: null },
  });
}

// Nhắc NV bán hàng cập nhật tình trạng khách hàng — bắn trong 3 ngày cuối tháng (thay vì đúng 1 ngày
// cuối cùng) vì app không có cron thật, chỉ kiểm tra mỗi khi có người tải trang (xem
// (dashboard)/layout.tsx) — cửa sổ 3 ngày để không bỏ lỡ nếu NV không mở app đúng ngày cuối tháng.
// Dedupe theo relatedId nhúng "userId:yyyy-MM" (giống src/lib/mother-ready.ts) — chỉ bắn 1 lần/tháng/NV.
// CHỈ đếm status: DA_PHAN_CONG — khách "Mặc định" (MAC_DINH) không tính vào, NV không bị nhắc cập nhật
// cho những khách này (đúng yêu cầu "không cần cập nhật hàng tháng").
export async function ensureCustomerStatusReminders(userId: string): Promise<void> {
  const now = new Date();
  if (getDate(now) < getDaysInMonth(now) - 2) return;

  const assignedCount = await prisma.customer.count({
    where: { assignedToId: userId, status: "DA_PHAN_CONG" },
  });
  if (assignedCount === 0) return;

  const relatedId = `${userId}:${format(now, "yyyy-MM")}`;
  const existing = await prisma.alert.findFirst({
    where: { type: "CUSTOMER_STATUS_UPDATE_DUE", relatedId },
    select: { id: true },
  });
  if (existing) return;

  await createAlert({
    type: "CUSTOMER_STATUS_UPDATE_DUE",
    title: "Cần cập nhật tình trạng khách hàng",
    message: `Bạn đang phụ trách ${assignedCount} khách hàng — vào "Cập nhật tình trạng khách hàng" để cập nhật Ngày ra đơn/Mã đơn gần nhất trước cuối tháng.`,
    userId,
    relatedId,
    relatedType: "Customer",
  });
}
