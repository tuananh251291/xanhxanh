import { prisma } from "@/lib/prisma";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { getRootingDueSlot, isRootingDueScheduleStarted } from "@/lib/rooting-week-group";
import { getRotationEpochResolver, resolveRotationEpoch } from "@/lib/rotation-epoch";

export type RootingHandoffTaskGroup = {
  roomId: string;
  groupId: string;
  groupName: string;
  done: boolean;
  // Chưa bàn giao vì NV Kỹ thuật chưa hoàn thành đánh giá chất lượng tuần xuất này (tới hết tuần) — Kho mô bị
  // chặn bàn giao (POST /api/transfers), nên không tính là Kho mô không hoàn thành.
  waitingEvaluation: boolean;
};

// Lấy mã giàn kệ ghi trong notes phiếu bàn giao thành phẩm — cả 2 luồng tạo phiếu đều ghi "Giàn kệ: A01C01,
// A01C02" (xem review-transfer-form.tsx, early-handoff-form.tsx). Phải dựa vào notes vì sau khi Kho thành
// phẩm xác nhận nhận, lô đã rời kệ (shelfId = null) — không còn cách nào khác biết phiếu thuộc Nhóm nào.
function shelfCodesFromNotes(notes: string | null): string[] {
  const match = notes?.match(/Giàn kệ:\s*(.+)$/);
  return match ? match[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

// Việc tuần "Bàn giao thành phẩm" của Kho mô: mỗi Nhóm tuần ra rễ ĐẾN HẠN trong tuần [weekStart, weekEnd]
// (rotationOrder khớp getRootingDueSlot của tuần đó, giống isDue ở summarizeRootingWeekGroups) là 1 việc
// cần làm, xong khi Kho mô đã tạo phiếu bàn giao (không bị từ chối) trong tuần đó cho kệ thuộc Nhóm. Trước
// đây đếm theo số phiếu tạo trong tuần — Kho mô không tạo phiếu nào thì 0/0 = 100% "hoàn thành" dù Nhóm đến
// hạn vẫn còn nguyên cây trên giàn (Bát Tràng tuần 05/10/2026).
// Nhóm đến hạn chỉ tính là việc cần làm khi thực sự có hàng: đã bàn giao trong tuần, HOẶC giàn của Nhóm còn
// lô (quantity > 0) vào kệ trước khi hết tuần — với tuần đã qua thì lô còn nằm lại tới giờ nghĩa là tuần đó
// chưa bàn giao.
export async function getRootingHandoffTaskGroups(
  warehouseId: string | null,
  weekStart: Date,
  weekEnd: Date
): Promise<RootingHandoffTaskGroup[]> {
  const [rooms, totalSlots, epochResolver] = await Promise.all([
    prisma.room.findMany({
      where: { type: "PHONG_RA_RE", isActive: true, ...(warehouseId ? { warehouseId } : {}) },
      select: {
        id: true,
        warehouseId: true,
        shelves: {
          where: { isActive: true, rotationGroupId: { not: null } },
          select: {
            id: true,
            code: true,
            rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
            _count: { select: { lots: { where: { status: "ACTIVE", quantity: { gt: 0 }, enteredAt: { lte: weekEnd } } } } },
          },
        },
      },
    }),
    prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
    getRotationEpochResolver("RA_RE"),
  ]);
  if (totalSlots === 0 || rooms.length === 0) return [];

  const [transfers, evaluations] = await Promise.all([
    prisma.transfer.findMany({
      where: {
        fromRoomId: { in: rooms.map((r) => r.id) },
        status: { not: "REJECTED" },
        createdAt: { gte: weekStart, lte: weekEnd },
      },
      select: { fromRoomId: true, notes: true, items: { select: { lot: { select: { shelfId: true } } } } },
    }),
    prisma.rootingQualityEvaluation.findMany({
      where: { roomId: { in: rooms.map((r) => r.id) }, weekStart: toStoredWeekStart(weekStart) },
      select: { roomId: true, rotationGroupId: true, completedAt: true },
    }),
  ]);
  const isWaitingEvaluation = (roomId: string, groupId: string) =>
    evaluations.some(
      (e) => e.roomId === roomId && e.rotationGroupId === groupId && (!e.completedAt || e.completedAt.getTime() > weekEnd.getTime())
    );

  const result: RootingHandoffTaskGroup[] = [];
  for (const room of rooms) {
    const epoch = resolveRotationEpoch(epochResolver, room.warehouseId);
    // Chưa cấu hình "Tuần khởi đầu" hoặc tuần còn trước mốc đó — lịch xoay vòng chưa chạy, không có Nhóm nào
    // đến hạn (cùng quy tắc với summarizeRootingWeekGroups).
    if (!epoch || !isRootingDueScheduleStarted(weekEnd, epoch)) continue;
    const slot = getRootingDueSlot(totalSlots, weekStart, epoch);

    const handedShelfIds = new Set<string>();
    const shelfIdByCode = new Map(room.shelves.map((s) => [s.code, s.id]));
    for (const t of transfers.filter((t) => t.fromRoomId === room.id)) {
      for (const code of shelfCodesFromNotes(t.notes)) {
        const id = shelfIdByCode.get(code);
        if (id) handedShelfIds.add(id);
      }
      // Phiếu còn PENDING thì lô vẫn nằm trên kệ — dự phòng cho phiếu notes không theo định dạng trên.
      for (const item of t.items) if (item.lot.shelfId) handedShelfIds.add(item.lot.shelfId);
    }

    const byGroup = new Map<string, RootingHandoffTaskGroup & { hasStock: boolean }>();
    for (const shelf of room.shelves) {
      const group = shelf.rotationGroup;
      if (!group || group.rotationOrder !== slot) continue;
      const entry = byGroup.get(group.id) ?? {
        roomId: room.id, groupId: group.id, groupName: group.name, done: false, hasStock: false,
        waitingEvaluation: isWaitingEvaluation(room.id, group.id),
      };
      if (shelf._count.lots > 0) entry.hasStock = true;
      if (handedShelfIds.has(shelf.id)) entry.done = true;
      byGroup.set(group.id, entry);
    }
    for (const { hasStock, ...entry } of byGroup.values()) {
      if (entry.done) entry.waitingEvaluation = false;
      if (hasStock || entry.done) result.push(entry);
    }
  }
  return result;
}
