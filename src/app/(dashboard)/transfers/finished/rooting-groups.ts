import { prisma } from "@/lib/prisma";
import { summarizeRootingWeekGroups, getRootingRotationEpoch } from "@/lib/rooting-week-group";

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
              where: { status: "ACTIVE" },
              select: { id: true, code: true, quantity: true, stageCode: true, enteredAt: true, plantType: { select: { id: true, code: true, name: true } } },
            },
          },
        },
      },
    }),
    prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
    getRootingRotationEpoch(),
  ]);

  const now = new Date();
  return rootingRooms.flatMap((room) => {
    const statuses = summarizeRootingWeekGroups(room.shelves, now, totalSlots, epochMonday);
    return statuses.map((s) => ({
      groupId: s.groupId,
      groupName: s.groupName,
      warehouseName: room.warehouse.name,
      roomName: room.name,
      oldestEnteredAt: s.oldestEnteredAt ? s.oldestEnteredAt.toISOString() : null,
      isDue: s.isDue,
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
    }));
  });
}
