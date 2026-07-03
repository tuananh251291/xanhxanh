import { prisma } from "@/lib/prisma";
import { startOfDay, isSameDay } from "date-fns";
import type { UserRole } from "@prisma/client";

// Sinh ChecklistItem hôm nay cho NV từ các template đang isActive của vai trò họ — mỗi template chỉ
// sinh dòng mới nếu NV không còn dòng nào PENDING từ trước (còn pending thì coi như đã "dồn" sang hôm
// nay, không nhân bản) và chưa có dòng nào của template đó cho đúng hôm nay.
export async function ensureTodayChecklist(userId: string, role: UserRole | null | undefined): Promise<void> {
  if (!role) return;
  const templates = await prisma.checklistTemplate.findMany({ where: { role, isActive: true } });
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
    .map((t) => ({ templateId: t.id, userId, title: t.title, assignedDate: today }));

  if (toCreate.length > 0) {
    await prisma.checklistItem.createMany({ data: toCreate });
  }
}

// Checklist hiển thị "hôm nay" cho NV: mọi việc chưa xong (bất kể sinh ngày nào — kể cả dồn từ hôm
// trước), cộng thêm việc đã xong nhưng vừa được sinh/hoàn thành trong hôm nay (để NV thấy đã tích).
export async function getTodayChecklist(userId: string) {
  const today = startOfDay(new Date());
  const items = await prisma.checklistItem.findMany({
    where: { userId },
    orderBy: [{ completed: "asc" }, { createdAt: "asc" }],
  });
  return items.filter((i) => !i.completed || isSameDay(i.assignedDate, today));
}
