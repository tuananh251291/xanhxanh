import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, addWeeks, startOfWeek } from "date-fns";
import { generateLotCode } from "@/lib/codes";
import type { ShelfPlacement } from "@/lib/shelf-assignment";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { getCurrentWeekSlot } from "@/lib/week-rotation";
import { computeRootingExpectedMoveAt, getRootingRotationEpoch } from "@/lib/rooting-week-group";

// Hạn "đến lịch cấy chuyển/chuyển kho thành phẩm" tính từ đúng lúc lô LÊN KỆ (Kho sáng), không phải lúc
// nhập dữ liệu cấy ở Phòng tối — vì Phòng tối còn giữ lô vài ngày trước khi Kho mô xác nhận nhận lên kệ,
// nếu tính từ lúc nhập dữ liệu thì hạn sẽ đến sớm hơn thực tế NV cần theo dõi trên kệ.
// Cây ra rễ (THANH_PHAM): theo lịch Nhóm tuần ra rễ của giàn nhận lô — Chủ nhật lượt tới lượt đầu tiên
// sau tuần lên kệ (computeRootingExpectedMoveAt, cùng công thức job syncRootingLotDueDates). Giàn chưa
// thuộc Nhóm/chưa cấu hình Tuần khởi đầu thì Thứ 2 tuần lên kệ + số tuần ra rễ như cũ.
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
  motherEpochMonday: Date | undefined,
  rooting: { rotationOrder: number | null; totalSlots: number; epochMonday: Date | undefined }
): Date {
  if (stage === "MAU_ME") {
    if (rotationOrder != null && motherEpochMonday) {
      const totalSlots = plantType.transferWaitWeeks;
      const currentSlot = getCurrentWeekSlot(totalSlots, enteredAt, motherEpochMonday);
      // Lô vừa lên kệ đúng khe đang là "tuần hiện tại" của Nhóm (rotationOrder === currentSlot) không thể
      // "đến hạn ngay hôm nay" — vừa nhập thì phải đợi ĐỦ 1 chu kỳ (totalSlots tuần) mới quay lại đúng khe
      // đó. % totalSlots cho kết quả 0 ở trường hợp này — quy về totalSlots thay vì 0 (dùng "|| totalSlots"
      // vì 0 falsy trong JS, mọi giá trị khác giữ nguyên).
      const weeksUntilDue = ((rotationOrder - currentSlot + totalSlots) % totalSlots) || totalSlots;
      // Chủ nhật của tuần tới lượt — cùng quy ước với computeImportedMotherExpectedMoveAt (mother-week-group.ts).
      return addDays(startOfWeek(addWeeks(enteredAt, weeksUntilDue), { weekStartsOn: 1 }), 6);
    }
    return addWeeks(enteredAt, plantType.transferWaitWeeks);
  }
  return computeRootingExpectedMoveAt(plantType.rootingWeeks, enteredAt, rooting.rotationOrder, rooting.totalSlots, rooting.epochMonday);
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
  // Mọi điểm đặt của 1 batch thuộc cùng 1 kho (planShelfAssignments/planSurplusPlacement chạy theo 1 kho) —
  // lấy kho từ kệ đầu tiên để dùng đúng tuần khởi đầu riêng của kho đó (nếu có).
  const firstMotherPlacement = placements.find((p) => p.lot.stage === "MAU_ME");
  const motherWarehouseId = firstMotherPlacement
    ? (await prisma.shelf.findUnique({ where: { id: firstMotherPlacement.shelfId }, select: { warehouseId: true } }))?.warehouseId
    : undefined;
  const motherEpochMonday = firstMotherPlacement ? await getMotherRotationEpoch(motherWarehouseId) : undefined;

  // Cây ra rễ: planShelfAssignments không gắn rotationOrder cho điểm đặt RA_RE — tra Nhóm tuần ra rễ của
  // từng giàn nhận lô + Tuần khởi đầu của kho + tổng số Nhóm (N), chỉ khi batch có lô thành phẩm.
  const rootingPlacements = placements.filter((p) => p.lot.stage === "THANH_PHAM");
  const rootingShelves = rootingPlacements.length > 0
    ? await prisma.shelf.findMany({
        where: { id: { in: [...new Set(rootingPlacements.map((p) => p.shelfId))] } },
        select: { id: true, warehouseId: true, rotationGroup: { select: { rotationKind: true, rotationOrder: true } } },
      })
    : [];
  const rootingOrderByShelf = new Map(
    rootingShelves.map((s) => [s.id, s.rotationGroup?.rotationKind === "RA_RE" ? s.rotationGroup.rotationOrder : null])
  );
  const [rootingTotalSlots, rootingEpochMonday] = rootingShelves.length > 0
    ? await Promise.all([
        prisma.shelfGroup.count({ where: { rotationKind: "RA_RE" } }),
        getRootingRotationEpoch(rootingShelves[0].warehouseId),
      ])
    : [0, undefined];
  const rootingFor = (shelfId: string) => ({
    rotationOrder: rootingOrderByShelf.get(shelfId) ?? null,
    totalSlots: rootingTotalSlots,
    epochMonday: rootingEpochMonday,
  });

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
        expectedMoveAt: computeExpectedMoveAt(first.lot.stage, first.lot.plantType, enteredAt, first.rotationOrder, motherEpochMonday, rootingFor(first.shelfId)),
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
          expectedMoveAt: computeExpectedMoveAt(part.lot.stage, part.lot.plantType, enteredAt, part.rotationOrder, motherEpochMonday, rootingFor(part.shelfId)),
          instructionId: part.lot.instructionId,
          parentLotId: lotId,
        },
      });
    }
  }
}
