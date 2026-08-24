import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { generateDailyTaskCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek, addDays, format } from "date-fns";

// "Đề xuất trồng/hủy" của Kho thành phẩm tự sinh 1 lần/tuần (không có cron thật trong app này — tính lazy
// mỗi lần tải trang, giống mọi hàm ensureXxx khác, xem src/app/(dashboard)/layout.tsx). weekStart dùng
// đúng chuẩn hoá toStoredWeekStart() như PlantingInstruction.weekStart.
export async function ensureWeeklyDeXuatTask(warehouseId: string | null) {
  if (!warehouseId) return;
  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  let task = await prisma.dailyTask.findFirst({ where: { type: "DE_XUAT_TRONG_HUY", warehouseId, weekStart } });
  if (!task) {
    task = await prisma.dailyTask.create({
      data: {
        code: await generateDailyTaskCode(),
        type: "DE_XUAT_TRONG_HUY",
        warehouseId,
        weekStart,
        notes: "Tự động tạo hàng tuần — chọn NV phụ trách bên dưới.",
      },
    });
  }

  // Nhắc hạn từ thứ 5 — chỉ 1 lần/tuần (dedup qua relatedId), giống ensureCustomerStatusReminders.
  const thursday = addDays(weekStart, 3);
  if (new Date() >= thursday && task.status === "PENDING") {
    const relatedId = `weekly-de-xuat:${warehouseId}:${format(weekStart, "yyyy-MM-dd")}`;
    const sent = await prisma.alert.findFirst({ where: { type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE", relatedId } });
    if (!sent) {
      await createAlert({
        type: "DE_XUAT_TRONG_HUY_WEEKLY_DUE",
        title: "Nhắc hạn: Đề xuất trồng/hủy tuần này",
        message: `Cần hoàn thành "Đề xuất trồng/hủy" (${task.code}) — hạn nhắc đã tới thứ 5.`,
        ...(task.assignedToId ? { userId: task.assignedToId } : { targetRole: "QUAN_LY_KHO_THANH_PHAM" as const }),
        relatedId,
        relatedType: "DailyTask",
      });
    }
  }
}

// Nhiệm vụ DE_XUAT_TRONG_HUY chỉ tính hoàn thành khi TOÀN BỘ ContaminationProposal liên kết (xem
// dailyTaskId) đã được Admin Duyệt — không phải lúc NV gửi. Tính lazy, không hook vào route duyệt.
export async function ensureDeXuatTaskCompletion(warehouseId: string | null) {
  const pending = await prisma.dailyTask.findMany({
    where: { type: "DE_XUAT_TRONG_HUY", status: "PENDING", ...(warehouseId ? { warehouseId } : {}) },
    include: { proposals: { select: { status: true } } },
  });
  for (const t of pending) {
    if (t.proposals.length > 0 && t.proposals.every((p) => p.status === "APPROVED")) {
      await prisma.dailyTask.update({ where: { id: t.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
  }
}
