import type { Prisma } from "@prisma/client";
import { addWeeks, startOfWeek } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import type { ShelfPlacement } from "@/lib/shelf-assignment";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { getCurrentWeekSlot } from "@/lib/week-rotation";

// Hạn "đến lịch cấy chuyển/chuyển kho thành phẩm" tính từ đúng lúc lô LÊN KỆ (Kho sáng), không phải lúc
// nhập dữ liệu cấy ở Phòng tối — vì Phòng tối còn giữ lô vài ngày trước khi Kho mô xác nhận nhận lên kệ,
// nếu tính từ lúc nhập dữ liệu thì hạn sẽ đến sớm hơn thực tế NV cần theo dõi trên kệ.
// Cây ra rễ (THANH_PHAM): tính từ ĐẦU TUẦN lúc lên kệ (Thứ 2), không phải đúng giờ phút bàn giao — vì
// lô lên kệ nằm trong đúng Nhóm tuần ra rễ của tuần đó (xem planShelfAssignments), nên mọi lô cùng vào 1
// Nhóm trong cùng 1 tuần phải dùng CHUNG đúng 1 hạn xuất (VD Nhóm bắt đầu nhận ở tuần 27, ra rễ 3 tuần
// thì mọi lô trong nhóm đó đều hạn tuần 30), không lệch nhau vài ngày dù bàn giao khác thời điểm trong
// tuần.
// Mẫu mẹ (MAU_ME): nếu kệ THẬT SỰ nhận lô (rotationOrder) đã thuộc 1 Nhóm tuần mẫu mẹ và đã cấu hình
// "Tuần khởi đầu" (motherEpochMonday) thì tính THEO ĐÚNG LỊCH XOAY VÒNG của Nhóm đó (giống hệt cách
// POST /api/inventory/stock-in tính lúc tạo lô mới trực tiếp lên kệ) — để khớp với trang "Kệ sắp đến
// hạn cấy chuyển" (summarizeMotherWeekGroups), vốn xác định "đến hạn" thuần theo Nhóm tuần của kệ chứ
// không đọc Lot.expectedMoveAt. Thiếu 1 trong 2 điều kiện (kệ chưa thuộc Nhóm, hoặc chưa cấu hình Tuần
// khởi đầu) thì rơi về công thức cũ (bàn giao + số tuần chờ) — giữ tương thích ngược.
function computeExpectedMoveAt(
  stage: "MAU_ME" | "THANH_PHAM",
  plantType: { rootingWeeks: number; transferWaitWeeks: number },
  enteredAt: Date,
  rotationOrder: number | null,
  motherEpochMonday: Date | undefined
): Date {
  if (stage === "MAU_ME") {
    if (rotationOrder != null && motherEpochMonday) {
      const totalSlots = plantType.transferWaitWeeks;
      const currentSlot = getCurrentWeekSlot(totalSlots, enteredAt, motherEpochMonday);
      const weeksUntilDue = (rotationOrder - currentSlot + totalSlots) % totalSlots;
      return startOfWeek(addWeeks(enteredAt, weeksUntilDue), { weekStartsOn: 1 });
    }
    return addWeeks(enteredAt, plantType.transferWaitWeeks);
  }
  return addWeeks(startOfWeek(enteredAt, { weekStartsOn: 1 }), plantType.rootingWeeks);
}

// Áp dụng kết quả planShelfAssignments/planSurplusPlacement vào DB: gán shelfId + enteredAt mới cho lô
// gốc (dùng chung cho PATCH /api/transfers/[id] và POST /api/transfers/receive-phong-toi — tách ra đây
// để 2 nơi không lặp lại logic tách lô khi tràn kệ). Nếu 1 lô bị tách thành nhiều điểm đặt (tràn
// capacity kệ đã chia), điểm đầu tiên cập nhật lô gốc (giảm quantity/initialQuantity), các điểm còn lại
// tạo lô con mới (parentLotId) với mã lô riêng.
export async function commitShelfPlacements(tx: Prisma.TransactionClient, placements: ShelfPlacement[]): Promise<void> {
  // Đọc "Tuần khởi đầu Nhóm tuần mẫu mẹ" 1 lần cho cả batch (dùng prisma singleton, không phải tx — chỉ
  // đọc cấu hình gần như không đổi, giống hệt cách POST /api/inventory/stock-in đã làm) — bỏ qua hẳn nếu
  // batch không có lô mẫu mẹ nào để không tốn 1 query thừa.
  const motherEpochMonday = placements.some((p) => p.lot.stage === "MAU_ME") ? await getMotherRotationEpoch() : undefined;

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
        // KHÔNG đụng vào darkRoomEnteredAt ở đây — giữ nguyên giá trị gốc đã set lúc tạo lô (ngày nhập
        // kho tối thật), tách biệt hẳn khỏi enteredAt vừa bị ghi đè thành ngày lên kệ ở trên.
        expectedMoveAt: computeExpectedMoveAt(first.lot.stage, first.lot.plantType, enteredAt, first.rotationOrder, motherEpochMonday),
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
        client: tx,
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
          // Lô con kế thừa ĐÚNG ngày nhập kho tối gốc của lô cha (part.lot), không phải "enteredAt" vừa
          // tính lại ở trên (đó là ngày lên kệ, dùng riêng cho expectedMoveAt).
          darkRoomEnteredAt: part.lot.darkRoomEnteredAt,
          expectedMoveAt: computeExpectedMoveAt(part.lot.stage, part.lot.plantType, enteredAt, part.rotationOrder, motherEpochMonday),
          instructionId: part.lot.instructionId,
          parentLotId: lotId,
        },
      });
    }
  }
}
