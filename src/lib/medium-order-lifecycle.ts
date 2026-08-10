import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { getMediumOrderSendAt } from "@/lib/medium-orders";

// Không có tiến trình chạy nền (cron) trong app này — theo đúng pattern ở src/lib/instruction-lifecycle.ts
// và src/lib/order-lifecycle.ts (kiểm tra ngầm mỗi lần tải trang, xem (dashboard)/layout.tsx). Đơn đặt
// hàng môi trường vẫn được tạo/gộp thêm chỉ định NGAY khi KY_THUAT ra chỉ định trong tuần (xem
// syncInstructionMediumOrder), nhưng KHÔNG báo/hiện cho NV môi trường ngay — chỉ tới đúng 00:00 Thứ 7
// (weekStart + 1 ngày, vì weekStart luôn là Thứ 6, xem getOrderWeekRange) mới coi là "gửi", đánh dấu
// sentAt + bắn 1 thông báo duy nhất mỗi đơn.
export async function ensureMediumOrdersSent(): Promise<void> {
  const now = new Date();
  const candidates = await prisma.mediumOrder.findMany({
    where: { sentAt: null },
    select: { id: true, code: true, weekStart: true },
  });
  const due = candidates.filter((o) => getMediumOrderSendAt(o.weekStart) <= now);
  if (due.length === 0) return;

  await prisma.mediumOrder.updateMany({ where: { id: { in: due.map((o) => o.id) } }, data: { sentAt: now } });

  for (const order of due) {
    await createAlert({
      type: "MEDIUM_ORDER_CREATED",
      title: "Có đơn đặt hàng môi trường mới",
      message: `Đơn ${order.code} đã sẵn sàng cho tuần này — xem đơn đặt hàng môi trường`,
      targetRole: "MOI_TRUONG",
      relatedId: order.id,
      relatedType: "MediumOrder",
    });
  }
}
