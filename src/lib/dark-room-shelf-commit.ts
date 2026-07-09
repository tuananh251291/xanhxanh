import type { Prisma } from "@prisma/client";
import { generateLotCode } from "@/lib/codes";
import type { ShelfPlacement } from "@/lib/shelf-assignment";

// Áp dụng kết quả planShelfAssignments/planSurplusPlacement vào DB: gán shelfId + enteredAt mới cho lô
// gốc (dùng chung cho PATCH /api/transfers/[id] và POST /api/transfers/receive-phong-toi — tách ra đây
// để 2 nơi không lặp lại logic tách lô khi tràn kệ). Nếu 1 lô bị tách thành nhiều điểm đặt (tràn
// capacity kệ đã chia), điểm đầu tiên cập nhật lô gốc (giảm quantity/initialQuantity), các điểm còn lại
// tạo lô con mới (parentLotId) với mã lô riêng.
export async function commitShelfPlacements(tx: Prisma.TransactionClient, placements: ShelfPlacement[]): Promise<void> {
  const byLot = new Map<string, ShelfPlacement[]>();
  for (const p of placements) {
    if (!byLot.has(p.lotId)) byLot.set(p.lotId, []);
    byLot.get(p.lotId)!.push(p);
  }

  for (const [lotId, parts] of byLot) {
    const [first, ...rest] = parts;
    const isSplit = rest.length > 0;
    await tx.lot.update({
      where: { id: lotId },
      data: {
        shelfId: first.shelfId,
        enteredAt: new Date(),
        ...(isSplit ? { quantity: first.quantity, initialQuantity: first.quantity } : {}),
      },
    });
    for (const part of rest) {
      const staffUser = part.lot.instruction?.assignedToId
        ? await tx.user.findUnique({ where: { id: part.lot.instruction.assignedToId }, select: { code: true } })
        : null;
      const code = await generateLotCode({
        plantTypeCode: part.lot.plantType.code,
        staffCode: staffUser?.code ?? "000",
        stageCode: part.lot.stageCode,
      });
      await tx.lot.create({
        data: {
          code,
          plantTypeId: part.lot.plantTypeId,
          stage: part.lot.stage,
          stageCode: part.lot.stageCode,
          shelfId: part.shelfId,
          quantity: part.quantity,
          initialQuantity: part.quantity,
          status: "ACTIVE",
          enteredAt: new Date(),
          instructionId: part.lot.instructionId,
          parentLotId: lotId,
        },
      });
    }
  }
}
