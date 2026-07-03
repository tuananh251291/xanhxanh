import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";

// Không có tiến trình chạy nền (cron) trong app này — kiểm tra "đã tới hạn cấy chuyển chưa" được gọi mỗi
// khi layout dashboard render cho KY_THUAT (xem (dashboard)/layout.tsx), coi như 1 checkpoint gần-thời-gian-thực
// thay vì lịch cố định. Dedupe theo (type, relatedId) nên gọi lại nhiều lần không tạo cảnh báo trùng.
export async function ensureMotherReadyAlerts(): Promise<void> {
  const dueLots = await prisma.lot.findMany({
    where: {
      stage: "MAU_ME",
      status: "ACTIVE",
      shelfId: { not: null },
      expectedMoveAt: { lte: new Date() },
    },
    select: { id: true, code: true, plantType: { select: { name: true } } },
  });
  if (dueLots.length === 0) return;

  const existingAlerts = await prisma.alert.findMany({
    where: { type: "MOTHER_LOT_READY", relatedId: { in: dueLots.map((l) => l.id) } },
    select: { relatedId: true },
  });
  const alertedIds = new Set(existingAlerts.map((a) => a.relatedId));
  const newLots = dueLots.filter((l) => !alertedIds.has(l.id));
  if (newLots.length === 0) return;

  await Promise.all(newLots.map((lot) =>
    createAlert({
      type: "MOTHER_LOT_READY",
      title: "Mẫu mẹ đến tuổi cấy chuyển",
      message: `Lô ${lot.code} (${lot.plantType.name}) đã đến hạn cấy chuyển — xem danh sách ở "Mẫu mẹ đến tuổi cấy"`,
      targetRole: "KY_THUAT",
      relatedId: lot.id,
      relatedType: "Lot",
    })
  ));
}
