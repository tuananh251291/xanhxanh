import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { summarizeMotherWeekGroups, getMotherDueDeadline, getMotherRotationEpoch } from "@/lib/mother-week-group";

// Không có tiến trình chạy nền (cron) trong app này — kiểm tra "sắp tới hạn cấy chuyển chưa" được gọi mỗi
// khi layout dashboard render cho KY_THUAT (xem (dashboard)/layout.tsx), coi như 1 checkpoint gần-thời-gian-thực
// thay vì lịch cố định. Báo theo TỪNG Nhóm tuần mẫu mẹ (không phải từng lô lẻ) — dùng lại
// summarizeMotherWeekGroups, N đã bao gồm luôn cửa sổ báo trước 1 tuần. Dedupe theo (type, relatedId),
// relatedId gắn kèm hạn chót (Thứ 5 của tuần báo) để tự bắn lại cảnh báo mới ở đợt xoay vòng kế tiếp
// thay vì im lặng mãi mãi sau lần bắn đầu tiên.
export async function ensureMotherReadyAlerts(): Promise<void> {
  const [shelves, motherEpochMonday] = await Promise.all([
    prisma.shelf.findMany({
      where: { isActive: true, room: { type: "PHONG_MAU_ME" }, rotationGroupId: { not: null } },
      select: {
        id: true,
        code: true,
        name: true,
        rowNumber: true,
        colNumber: true,
        block: true,
        warehouse: { select: { id: true, code: true, name: true } },
        rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
        plantType: { select: { code: true, transferWaitWeeks: true } },
        // Lô đã dùng làm nguồn cho 1 chỉ định cấy CÒN HIỆU LỰC coi như đã có chủ — chỉ định đã hủy thì
        // không còn giữ chỗ, giống điều kiện ở /instructions và /instructions/mother-due/[warehouseId].
        lots: {
          where: { status: "ACTIVE", instructionItems: { none: { instruction: { status: { in: ["ACTIVE", "DRAFT"] } } } } },
          select: { quantity: true },
        },
      },
    }),
    getMotherRotationEpoch(),
  ]);
  const dueGroups = summarizeMotherWeekGroups(shelves, new Date(), motherEpochMonday).filter((g) => g.isDue);
  if (dueGroups.length === 0) return;

  const deadline = getMotherDueDeadline();
  const cycleLabel = format(deadline, "yyyy-MM-dd");
  const relatedIds = dueGroups.map((g) => `${g.groupId}:${cycleLabel}`);

  const existingAlerts = await prisma.alert.findMany({
    where: { type: "MOTHER_LOT_READY", relatedId: { in: relatedIds } },
    select: { relatedId: true },
  });
  const alertedIds = new Set(existingAlerts.map((a) => a.relatedId));
  const newGroups = dueGroups.filter((g) => !alertedIds.has(`${g.groupId}:${cycleLabel}`));
  if (newGroups.length === 0) return;

  await Promise.all(newGroups.map((g) =>
    createAlert({
      type: "MOTHER_LOT_READY",
      title: "Mẫu mẹ sắp đến tuổi cấy chuyển",
      message: `Nhóm tuần mẫu mẹ ${g.groupName} — ${g.lotCount} lô, ${g.totalQuantity.toLocaleString("vi-VN")} mẫu mẹ sắp đến hạn cấy chuyển — cần xuất trước Thứ 5 (${format(deadline, "dd/MM/yyyy")})`,
      targetRole: "KY_THUAT",
      relatedId: `${g.groupId}:${cycleLabel}`,
      relatedType: "ShelfGroup",
    })
  ));
}
