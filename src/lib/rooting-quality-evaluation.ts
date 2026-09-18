import { prisma } from "@/lib/prisma";
import { createAlert, createAlertForWarehouseStaff } from "@/lib/inventory";
import { generateRootingQualityEvaluationCode } from "@/lib/codes";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { summarizeRootingWeekGroups, getRootingRotationEpoch } from "@/lib/rooting-week-group";
import { startOfWeek, addDays } from "date-fns";

// "Đánh giá chất lượng cây ra rễ" — NV Kỹ thuật đánh giá đạt/không đạt cho MỖI Nhóm tuần ra rễ ĐANG ĐẾN
// HẠN của 1 kho sản xuất, trước khi Kho mô được bàn giao sang Kho thành phẩm (hạn Thứ 7 — xem
// PATCH /api/rooting-quality-evaluations/[id]). Tự sinh lazy mỗi lần tải trang giống mọi hàm ensureXxx
// khác (xem src/app/(dashboard)/layout.tsx), tự động giao thẳng cho đúng NV Kỹ thuật DUY NHẤT của kho đó
// (không qua bước phân công thủ công — mỗi kho chỉ có 1 người, khác hẳn Kho thành phẩm nhiều NV).
export async function ensureWeeklyRootingQualityEvaluation(warehouseId: string | null) {
  if (!warehouseId) return;

  const kyThuat = await prisma.user.findFirst({
    where: { workplaceWarehouseId: warehouseId, role: "KY_THUAT", isActive: true },
    select: { id: true },
  });
  if (!kyThuat) return;

  const [rooms, raReGroups, epochMonday] = await Promise.all([
    prisma.room.findMany({
      where: { warehouseId, type: "PHONG_RA_RE", isActive: true },
      select: {
        id: true,
        shelves: {
          where: { isActive: true },
          select: {
            id: true, code: true, name: true,
            rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
            lots: { where: { status: "ACTIVE" }, select: { quantity: true, enteredAt: true } },
          },
        },
      },
    }),
    prisma.shelfGroup.findMany({ where: { rotationKind: "RA_RE" }, select: { id: true, rotationOrder: true } }),
    getRootingRotationEpoch(),
  ]);
  if (raReGroups.length === 0) return;

  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  for (const room of rooms) {
    const statuses = summarizeRootingWeekGroups(room.shelves, new Date(), raReGroups.length, epochMonday);
    for (const s of statuses.filter((g) => g.isDue)) {
      await prisma.rootingQualityEvaluation.upsert({
        where: { roomId_rotationGroupId_weekStart: { roomId: room.id, rotationGroupId: s.groupId, weekStart } },
        update: {},
        create: {
          code: await generateRootingQualityEvaluationCode(),
          warehouseId,
          roomId: room.id,
          rotationGroupId: s.groupId,
          weekStart,
          assignedToId: kyThuat.id,
        },
      });
    }
  }
}

// Nhắc hạn từ Thứ 4 — hạn hoàn thành trước Thứ 6 (để Kho mô còn kịp bàn giao Thứ 7), 1 lần/tuần/Nhóm
// (dedup qua relatedId), cùng quy ước ensureWeeklyDeXuatTask/ensureWeeklyMarketInspectionTask.
export async function ensureRootingQualityEvaluationReminder(warehouseId: string | null) {
  if (!warehouseId) return;
  const weekStart = toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const wednesday = addDays(weekStart, 2);
  if (new Date() < wednesday) return;

  const pending = await prisma.rootingQualityEvaluation.findMany({
    where: { warehouseId, weekStart, status: "PENDING" },
    select: { id: true, code: true, assignedToId: true },
  });
  for (const evaluation of pending) {
    const relatedId = `rooting-quality-eval:${evaluation.id}`;
    const sent = await prisma.alert.findFirst({ where: { type: "ROOTING_QUALITY_EVALUATION_DUE", relatedId } });
    if (sent) continue;
    await createAlert({
      type: "ROOTING_QUALITY_EVALUATION_DUE",
      title: "Đến hạn đánh giá chất lượng cây ra rễ",
      message: `Cần hoàn thành đánh giá "${evaluation.code}" trước Thứ Sáu tuần này để Kho mô kịp bàn giao Thứ Bảy.`,
      userId: evaluation.assignedToId,
      relatedId,
      relatedType: "RootingQualityEvaluation",
    });
  }
}

// Sau khi NV Kỹ thuật hoàn thành 1 đánh giá — báo Kho mô cùng kho biết tỉ lệ đạt/không đạt + lý do (Admin
// cấp cao/Admin kỹ thuật xem qua widget Dashboard, xem ADMIN_DASHBOARD_ALERT_TYPES, không cần alert riêng).
export async function notifyRootingQualityEvaluationReady(params: {
  warehouseId: string;
  code: string;
  totalQuantity: number;
  passedQuantity: number;
  reason: string;
}) {
  const { warehouseId, code, totalQuantity, passedQuantity, reason } = params;
  const failedQuantity = totalQuantity - passedQuantity;
  const pct = totalQuantity > 0 ? Math.round((passedQuantity / totalQuantity) * 1000) / 10 : 0;
  await createAlertForWarehouseStaff({
    role: "KHO_MO",
    warehouseId,
    type: "ROOTING_QUALITY_EVALUATION_READY",
    title: "Đã có kết quả đánh giá chất lượng cây ra rễ",
    message: `Đánh giá ${code}: đạt ${passedQuantity.toLocaleString("vi-VN")}/${totalQuantity.toLocaleString("vi-VN")} (${pct}%), không đạt ${failedQuantity.toLocaleString("vi-VN")} đã lùi sang tuần sau. Lý do: ${reason}`,
    relatedId: code,
    relatedType: "RootingQualityEvaluation",
  });
}
