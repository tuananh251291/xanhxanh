import { prisma } from "@/lib/prisma";
import { startOfDay, isSameDay } from "date-fns";
import type { UserRole } from "@prisma/client";

// Checklist hiển thị "hôm nay" cho NV: mọi việc chưa xong (bất kể sinh ngày nào — kể cả dồn từ hôm
// trước), cộng thêm việc đã xong nhưng vừa được sinh/hoàn thành trong hôm nay (để NV thấy đã tích).
// Chỉ còn dùng cho kind=DARK_ROOM_CHECK (trang /dark-room-check) — SIMPLE đã bỏ (xem ensureTodayChecklist).
export async function getTodayChecklist(userId: string) {
  const today = startOfDay(new Date());
  const items = await prisma.checklistItem.findMany({
    where: { userId },
    orderBy: [{ completed: "asc" }, { createdAt: "asc" }],
  });
  return items.filter((i) => !i.completed || isSameDay(i.assignedDate, today));
}

// Sinh ChecklistItem hôm nay cho NV từ các template đang isActive của vai trò họ — mỗi template chỉ
// sinh dòng mới nếu NV không còn dòng nào PENDING từ trước (còn pending thì coi như đã "dồn" sang hôm
// nay, không nhân bản) và chưa có dòng nào của template đó cho đúng hôm nay.
export async function ensureTodayChecklist(userId: string, role: UserRole | null | undefined): Promise<void> {
  if (!role) return;
  const templates = await prisma.checklistTemplate.findMany({ where: { role, isActive: true, kind: "DARK_ROOM_CHECK" } });
  if (templates.length === 0) return;

  const today = startOfDay(new Date());
  const existing = await prisma.checklistItem.findMany({
    where: { userId, templateId: { in: templates.map((t) => t.id) } },
    select: { templateId: true, completed: true, assignedDate: true },
  });

  const toCreate = templates
    .filter((t) => {
      const items = existing.filter((i) => i.templateId === t.id);
      const hasPending = items.some((i) => !i.completed);
      const hasToday = items.some((i) => isSameDay(i.assignedDate, today));
      return !hasPending && !hasToday;
    })
    .map((t) => ({ templateId: t.id, userId, title: t.title, kind: t.kind, assignedDate: today }));

  if (toCreate.length > 0) {
    await prisma.checklistItem.createMany({ data: toCreate });
  }
}

// Tự động hoàn thành nhiệm vụ nhỏ "2. Kiểm tra kho nhiễm cá nhân" (ChecklistItem.subTask2Done) cho MỌI
// NV kho mô đang làm việc tại 1 kho sản xuất — gọi sau khi tất cả NV cấy mô của kho đó đã được đánh dấu
// "Kiểm tra xong" trong ngày (xem POST /api/personal-contamination-checks). Việc kiểm tra vật lý chỉ cần
// 1 NV kho mô làm là đủ cho cả kho nên hoàn thành cho TẤT CẢ NV kho mô cùng kho, không chỉ người vừa bấm.
export async function completeDarkRoomSubTask2ForWarehouse(warehouseId: string): Promise<void> {
  const khoMoStaff = await prisma.user.findMany({
    where: { role: "KHO_MO", workplaceWarehouseId: warehouseId },
    select: { id: true },
  });

  for (const staff of khoMoStaff) {
    const item = await prisma.checklistItem.findFirst({
      where: { userId: staff.id, kind: "DARK_ROOM_CHECK" },
      orderBy: { createdAt: "desc" },
    });
    if (!item || item.subTask2Done) continue;

    const nowCompleted = item.subTask1Done;
    const updateData = {
      subTask2Done: true,
      subTask2At: new Date(),
      completed: nowCompleted,
      completedAt: nowCompleted ? new Date() : item.completedAt,
    };
    if (nowCompleted !== item.completed) {
      await prisma.$transaction([
        prisma.checklistItem.update({ where: { id: item.id }, data: updateData }),
        prisma.checklistItemLog.create({ data: { itemId: item.id, completed: nowCompleted } }),
      ]);
    } else {
      await prisma.checklistItem.update({ where: { id: item.id }, data: updateData });
    }
  }
}
