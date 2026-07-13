import type { Prisma } from "@prisma/client";
import { addWeeks } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import type { ShelfPlacement } from "@/lib/shelf-assignment";

// Hạn "đến lịch cấy chuyển/chuyển kho thành phẩm" tính từ đúng lúc lô LÊN KỆ (Kho sáng), không phải lúc
// nhập dữ liệu cấy ở Phòng tối — vì Phòng tối còn giữ lô vài ngày trước khi Kho mô xác nhận nhận lên kệ,
// nếu tính từ lúc nhập dữ liệu thì hạn sẽ đến sớm hơn thực tế NV cần theo dõi trên kệ.
function computeExpectedMoveAt(
  stage: "MAU_ME" | "THANH_PHAM",
  plantType: { rootingWeeks: number; transferWaitWeeks: number },
  enteredAt: Date
): Date {
  return addWeeks(enteredAt, stage === "MAU_ME" ? plantType.transferWaitWeeks : plantType.rootingWeeks);
}

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
    const enteredAt = new Date();
    await tx.lot.update({
      where: { id: lotId },
      data: {
        shelfId: first.shelfId,
        // Lô rời hẳn Phòng tối khi lên kệ Kho sáng — bắt buộc null theo đúng bất biến "Kho sản xuất
        // luôn dùng shelfId, roomId luôn null" (xem prisma/schema.prisma, model Lot). Thiếu dòng này
        // khiến lô đã lên kệ vẫn còn roomId trỏ về Phòng tối cũ, hiện lại trên /my-dark-room và
        // /product-handover như thể chưa bàn giao dù Kho mô đã xác nhận xong.
        roomId: null,
        enteredAt,
        expectedMoveAt: computeExpectedMoveAt(first.lot.stage, first.lot.plantType, enteredAt),
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
          enteredAt,
          expectedMoveAt: computeExpectedMoveAt(part.lot.stage, part.lot.plantType, enteredAt),
          instructionId: part.lot.instructionId,
          parentLotId: lotId,
        },
      });
    }
  }
}
