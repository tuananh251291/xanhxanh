import { prisma } from "@/lib/prisma";
import { computeImportedMotherExpectedMoveAt } from "@/lib/mother-week-group";
import { getRotationEpochResolver, resolveRotationEpoch } from "@/lib/rotation-epoch";

// Đồng bộ Lot.expectedMoveAt của lô mẫu mẹ trên giàn với lịch Nhóm tuần MM — chạy định kỳ (xem
// instrumentation-node.ts). Lý do: expectedMoveAt chỉ ghi 1 LẦN lúc lô lên kệ, nhiều đường ghi khác nhau
// (bàn giao, nhập Excel, tách/chuyển kệ) tính theo công thức khác nhau (có nơi "vào kệ + N tuần" không khớp
// lượt Nhóm), và KHÔNG BAO GIỜ tự dời sang lượt sau khi lô chưa được cấy chuyển ở lượt đó (VD lô vừa lên kệ
// 2 ngày trước lượt Nhóm, còn non nên bỏ qua) — báo cáo "Lô sắp/quá hạn" và Tồn kho sáng hiện "quá hạn"
// hàng chục ngày trong khi lịch thực tế (trang Kệ đến hạn cấy chuyển) chưa tới lượt (09/10/2026: Bát Tràng
// I06C02 MT067, E02C03..C08 AL052).
// - Giàn thuộc Nhóm tuần MM: hạn = lượt GẦN NHẤT của Nhóm kể từ tuần này (computeImportedMotherExpectedMoveAt).
// - Giàn "Kho quá hạn" trong Kho mẫu mẹ chung: không tính hạn (null) — MM dư chờ dùng, không theo lịch nào.
// Giàn chưa thuộc Nhóm hoặc kho chưa cấu hình Tuần khởi đầu: giữ nguyên.
export async function syncMotherLotDueDates(now: Date = new Date()): Promise<{ updated: number }> {
  const [epochResolver, lots] = await Promise.all([
    getRotationEpochResolver("MAU_ME"),
    prisma.lot.findMany({
      where: { stage: "MAU_ME", status: "ACTIVE", quantity: { gt: 0 }, shelfId: { not: null } },
      select: {
        id: true,
        enteredAt: true,
        expectedMoveAt: true,
        plantType: { select: { transferWaitWeeks: true } },
        shelf: {
          select: {
            warehouseId: true,
            sharedMotherPool: true,
            rotationGroup: { select: { rotationKind: true, rotationOrder: true } },
          },
        },
      },
    }),
  ]);

  const changes: { id: string; expectedMoveAt: Date | null }[] = [];
  for (const lot of lots) {
    const shelf = lot.shelf;
    if (!shelf) continue;
    let next: Date | null;
    if (shelf.sharedMotherPool === "QUA_HAN") {
      next = null;
    } else {
      const group = shelf.rotationGroup;
      const epoch = resolveRotationEpoch(epochResolver, shelf.warehouseId);
      if (group?.rotationKind !== "MAU_ME" || group.rotationOrder == null || !epoch || lot.plantType.transferWaitWeeks <= 0) continue;
      next = computeImportedMotherExpectedMoveAt(lot.plantType.transferWaitWeeks, lot.enteredAt, group.rotationOrder, epoch, now);
    }
    if ((lot.expectedMoveAt?.getTime() ?? null) !== (next?.getTime() ?? null)) changes.push({ id: lot.id, expectedMoveAt: next });
  }

  for (let i = 0; i < changes.length; i += 50) {
    await prisma.$transaction(
      changes.slice(i, i + 50).map((c) => prisma.lot.update({ where: { id: c.id }, data: { expectedMoveAt: c.expectedMoveAt } }))
    );
  }
  return { updated: changes.length };
}
