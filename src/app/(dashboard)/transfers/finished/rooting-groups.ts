import { prisma } from "@/lib/prisma";
import { summarizeRootingWeekGroups, getRootingRotationEpochResolver } from "@/lib/rooting-week-group";
import { resolveRotationEpoch } from "@/lib/rotation-epoch";
import { findPendingRootingEvaluationsForShelves, pendingRootingEvaluationMessage } from "@/lib/rooting-quality-evaluation";

export type GroupLot = {
  id: string;
  code: string;
  quantity: number;
  stageCode: string;
  enteredAt: string;
  plantType: { id: string; code: string; name: string };
};
export type GroupShelf = { id: string; code: string; name: string; roomId: string; lots: GroupLot[] };
export type RootingGroup = {
  groupId: string;
  groupName: string;
  warehouseName: string;
  roomName: string;
  oldestEnteredAt: string | null;
  isDue: boolean;
  // Đánh giá chất lượng tuần này còn PENDING — Kho mô chưa được bàn giao Nhóm này (POST /api/transfers chặn).
  pendingEvaluationMessage: string | null;
  shelves: GroupShelf[];
};

// Nhóm tuần ra rễ của mọi kệ Phòng ra rễ (không chỉ nhóm ĐÃ đến hạn) — dùng chung cho thẻ cảnh báo tự
// động (TransferFinishedForm, chỉ lọc isDue=true) và trang "Bàn giao sớm theo Nhóm tuần ra rễ"
// (early/page.tsx, cho chọn bất kỳ Nhóm nào kể cả chưa đến hạn). enteredAt của từng lô được giữ lại để
// phân bổ theo thứ tự lô cũ trước (FIFO) khi NV nhập "Số đạt xuất" nhỏ hơn tổng tồn của 1 kệ+quy cách.
export async function getRootingGroupsForHandoff(workplaceWarehouseId: string | null): Promise<RootingGroup[]> {
  // totalSlots (N) = tổng số Nhóm xoay vòng RA_RE đang cấu hình TOÀN HỆ THỐNG (không lọc theo kho — 1
  // Nhóm xoay vòng có thể gồm kệ ở nhiều kho khác nhau) — giống hệt N dùng ở planShelfAssignments để 2 nơi
  // luôn đồng bộ cùng 1 lịch xoay vòng, xem src/lib/shelf-assignment.ts.
  const [rootingRooms, totalSlots, epochMonday] = await Promise.all([
    prisma.room.findMany({
      where: {
        type: "PHONG_RA_RE",
        isActive: true,
        ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
      },
      include: {
        warehouse: { select: { name: true } },
        shelves: {
          where: { isActive: true },
          select: {
            id: true,
            code: true,
            name: true,
            rotationGroupId: true,
            rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
            lots: {
              // Lô về 0 vẫn giữ status ACTIVE (không bị xoá) — bỏ qua để không hiện dòng/đếm lô rỗng.
              where: { status: "ACTIVE", quantity: { gt: 0 } },
              select: { id: true, code: true, quantity: true, stageCode: true, enteredAt: true, plantType: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    }),
    prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
    getRootingRotationEpochResolver(),
  ]);

  const pendingEvaluations = await findPendingRootingEvaluationsForShelves(rootingRooms.flatMap((r) => r.shelves.map((s) => s.id)));

  const now = new Date();
  return rootingRooms.flatMap((room) => {
    const statuses = summarizeRootingWeekGroups(room.shelves, now, totalSlots, resolveRotationEpoch(epochMonday, room.warehouseId));
    return statuses.map((s) => {
      const pending = pendingEvaluations.filter((p) => p.roomId === room.id && p.rotationGroupId === s.groupId);
      return {
        groupId: s.groupId,
        groupName: s.groupName,
        warehouseName: room.warehouse.name,
        roomName: room.name,
        oldestEnteredAt: s.oldestEnteredAt ? s.oldestEnteredAt.toISOString() : null,
        isDue: s.isDue,
        pendingEvaluationMessage: pending.length > 0 ? pendingRootingEvaluationMessage(pending) : null,
        shelves: room.shelves
          .filter((sh) => sh.rotationGroupId === s.groupId)
          .map((sh) => ({
            id: sh.id,
            code: sh.code,
            name: sh.name,
            roomId: room.id,
            lots: sh.lots.map((l) => ({
              id: l.id,
              code: l.code,
              quantity: l.quantity,
              stageCode: l.stageCode,
              enteredAt: l.enteredAt.toISOString(),
              plantType: l.plantType,
            })),
          })),
      };
    });
  });
}
