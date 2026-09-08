import { prisma } from "@/lib/prisma";
import { createAlertForWarehouseStaff } from "@/lib/inventory";

// Không có tiến trình chạy nền (cron) trong app này — kiểm tra "đã đủ thời gian ra rễ chưa" được gọi mỗi
// khi layout dashboard render cho KHO_MO (xem (dashboard)/layout.tsx), coi như 1 checkpoint gần-thời-gian-thực
// thay vì lịch cố định. Dedupe theo (type, relatedId) nên gọi lại nhiều lần không tạo cảnh báo trùng. Chỉ
// báo cho đúng NV Kho mô đang được gán làm việc ở ĐÚNG kho có lô đó (createAlertForWarehouseStaff) — không
// broadcast targetRole cho mọi NV Kho mô toàn hệ thống như trước.
export async function ensureRootingReadyAlerts(): Promise<void> {
  const dueLots = await prisma.lot.findMany({
    where: {
      stage: "THANH_PHAM",
      status: "ACTIVE",
      shelfId: { not: null },
      expectedMoveAt: { lte: new Date() },
    },
    select: { id: true, code: true, plantType: { select: { name: true } }, shelf: { select: { warehouseId: true } } },
  });
  if (dueLots.length === 0) return;

  const existingAlerts = await prisma.alert.findMany({
    where: { type: "ROOTING_LOT_READY", relatedId: { in: dueLots.map((l) => l.id) } },
    select: { relatedId: true },
  });
  const alertedIds = new Set(existingAlerts.map((a) => a.relatedId));
  const newLots = dueLots.filter((l) => !alertedIds.has(l.id));
  if (newLots.length === 0) return;

  await Promise.all(newLots.map((lot) =>
    createAlertForWarehouseStaff({
      role: "KHO_MO",
      warehouseId: lot.shelf?.warehouseId,
      type: "ROOTING_LOT_READY",
      title: "Lô ra rễ đến hạn chuyển kho thành phẩm",
      message: `Lô ${lot.code} (${lot.plantType.name}) đã đủ thời gian ra rễ — xem danh sách ở "Bàn giao thành phẩm"`,
      relatedId: lot.id,
      relatedType: "Lot",
    })
  ));
}
