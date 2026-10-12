import { prisma } from "@/lib/prisma";
import { computeRootingExpectedMoveAt } from "@/lib/rooting-week-group";
import { getRotationEpochResolver, resolveRotationEpoch } from "@/lib/rotation-epoch";

// Đồng bộ Lot.expectedMoveAt của lô cây ra rễ trên giàn Phòng ra rễ với lịch Nhóm tuần ra rễ — chạy định kỳ
// cùng syncMotherLotDueDates (xem instrumentation-node.ts). Lý do: hạn chỉ ghi 1 lần lúc lô sinh ra/lên kệ
// theo "lên kệ + số tuần ra rễ", lệch với lịch bàn giao thật theo Nhóm, và KHÔNG cập nhật khi lô bị lùi sang
// Nhóm kế tiếp sau đánh giá chất lượng/đổi giàn — báo cáo "Lô sắp/quá hạn" và Tồn kho sáng hiện "quá hạn"
// trong khi Nhóm chưa tới lượt (12/10/2026: 119 lô Bát Tràng). Hạn tính lại từ ngày lô lên giàn hiện tại
// (enteredAt) — không "dời" sang lượt sau nếu lượt đã qua mà lô vẫn còn trên giàn (đó là quá hạn thật).
// Giàn chưa thuộc Nhóm hoặc kho chưa cấu hình Tuần khởi đầu: giữ nguyên.
export async function syncRootingLotDueDates(): Promise<{ updated: number }> {
  const [epochResolver, totalSlots, lots] = await Promise.all([
    getRotationEpochResolver("RA_RE"),
    prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
    prisma.lot.findMany({
      where: { stage: "THANH_PHAM", status: "ACTIVE", quantity: { gt: 0 }, shelf: { room: { type: "PHONG_RA_RE" } } },
      select: {
        id: true,
        enteredAt: true,
        expectedMoveAt: true,
        plantType: { select: { rootingWeeks: true } },
        shelf: { select: { warehouseId: true, rotationGroup: { select: { rotationKind: true, rotationOrder: true } } } },
      },
    }),
  ]);
  if (totalSlots === 0) return { updated: 0 };

  const changes: { id: string; expectedMoveAt: Date }[] = [];
  for (const lot of lots) {
    const group = lot.shelf?.rotationGroup;
    const epoch = lot.shelf ? resolveRotationEpoch(epochResolver, lot.shelf.warehouseId) : undefined;
    if (group?.rotationKind !== "RA_RE" || group.rotationOrder == null || !epoch) continue;
    const next = computeRootingExpectedMoveAt(lot.plantType.rootingWeeks, lot.enteredAt, group.rotationOrder, totalSlots, epoch);
    if (lot.expectedMoveAt?.getTime() !== next.getTime()) changes.push({ id: lot.id, expectedMoveAt: next });
  }

  for (let i = 0; i < changes.length; i += 50) {
    await prisma.$transaction(
      changes.slice(i, i + 50).map((c) => prisma.lot.update({ where: { id: c.id }, data: { expectedMoveAt: c.expectedMoveAt } }))
    );
  }
  return { updated: changes.length };
}
