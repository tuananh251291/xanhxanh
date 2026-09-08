import { prisma } from "@/lib/prisma";
import type { AlertType } from "@prisma/client";

export async function getAvailableQuantity(lotId: string): Promise<number> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) return 0;
  const held = await prisma.orderItem.aggregate({
    where: {
      lotId,
      order: { status: { in: ["HELD", "CONFIRMED"] } },
      OR: [{ processingRequest: null }, { processingRequest: { status: { not: "COMPLETED" } } }],
    },
    _sum: { quantity: true },
  });
  return lot.quantity - (held._sum.quantity ?? 0);
}

export async function getSystemConfig(key: string, defaultValue: string): Promise<string> {
  const config = await prisma.systemConfig.findUnique({ where: { key } });
  return config?.value ?? defaultValue;
}

export async function createAlert(data: {
  type: AlertType;
  title: string;
  message: string;
  userId?: string;
  targetRole?: "SUPER_ADMIN" | "ADMIN" | "KY_THUAT" | "CAY_MO" | "KHO_MO" | "KHO_THANH_PHAM" | "QUAN_LY_KHO_THANH_PHAM" | "SALE" | "MOI_TRUONG" | "DIEU_PHOI";
  relatedId?: string;
  relatedType?: string;
}) {
  return prisma.alert.create({ data });
}

// Gửi cảnh báo cho ĐÚNG NV (KY_THUAT/KHO_MO) đang được gán làm việc tại 1 kho sản xuất cụ thể — KHÔNG
// dùng targetRole (broadcast tới MỌI NV cùng role trên toàn hệ thống, xem GET /api/alerts:
// `targetRole IN alertTargetRolesFor(role)`) vì 2 vai trò này luôn gắn với đúng 1 cơ sở sản xuất
// (workplaceWarehouseId) — NV ở cơ sở khác không cần và không nên thấy sự kiện không liên quan tới mình.
// warehouseId null (chưa xác định được đúng cơ sở, hiếm) → KHÔNG gửi gì cả, tránh gửi tràn lan thay vì
// lùi về broadcast cũ.
// `skipIfUnreadExists`: bỏ qua ĐÚNG những NV đã có sẵn 1 alert CHƯA ĐỌC cùng (type, relatedId) — dùng khi
// 1 sự kiện có thể lặp lại nhiều lần trước khi NV kịp đọc (VD lưu nhật ký cấy mỗi ngày đều kiểm tra lại
// ngưỡng nhiễm) để tránh spam nhiều alert trùng cho cùng 1 NV, khác hẳn dedupe theo relatedId đã tồn tại
// TOÀN CỤC (dùng khi relatedId tự mang tính duy nhất theo chu kỳ, xem mother-ready.ts/rooting-ready.ts).
export async function createAlertForWarehouseStaff(params: {
  role: "KY_THUAT" | "KHO_MO";
  warehouseId: string | null | undefined;
  type: AlertType;
  title: string;
  message: string;
  relatedId?: string;
  relatedType?: string;
  skipIfUnreadExists?: boolean;
}): Promise<void> {
  const { role, warehouseId, skipIfUnreadExists, ...alertData } = params;
  if (!warehouseId) return;
  const staff = await prisma.user.findMany({
    where: { role, workplaceWarehouseId: warehouseId, isActive: true },
    select: { id: true },
  });
  if (staff.length === 0) return;

  let targetStaff = staff;
  if (skipIfUnreadExists && alertData.relatedId) {
    const existing = await prisma.alert.findMany({
      where: { type: alertData.type, relatedId: alertData.relatedId, status: "UNREAD", userId: { in: staff.map((s) => s.id) } },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existing.map((a) => a.userId));
    targetStaff = staff.filter((s) => !alreadyNotified.has(s.id));
  }

  await Promise.all(targetStaff.map((s) => createAlert({ ...alertData, userId: s.id })));
}
