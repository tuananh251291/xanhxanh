import { endOfWeek, subWeeks } from "date-fns";
import { prisma } from "@/lib/prisma";
import { MOTHER_WAREHOUSE_TRANSFER_TAG } from "@/types";

// Báo cáo "Số lượng mẫu mẹ gia tăng" (Admin) — đo sản lượng mẫu mẹ (MAU_ME) 1 kho sản xuất ("cơ sở") thực
// sự làm tăng thêm trong 1 khoảng tuần:
//
//   Gia tăng(tuần n → n+x) =
//       Tồn kho sáng cuối kỳ (hết CN tuần n+x)
//     − Tồn kho sáng cuối kỳ (hết CN tuần n-1)
//     + Phần mẫu mẹ trong chỉ định ĐÃ bàn giao mà NV chưa cấy hết (tính đến hết tuần n+x)
//     + Số đã chuyển đi cơ sở khác trong khoảng (tuần n-1 → n+x) — KHÔNG bị trừ, vẫn tính là sản lượng
//       của cơ sở này (đã xác nhận với Admin — mẫu mẹ nhận VỀ từ cơ sở khác thì cứ tính vào tồn cuối kỳ
//       bình thường, không cần xử lý riêng).
//
// Hệ thống không lưu lịch sử tồn kho theo thời điểm (Lot.quantity chỉ là số hiện tại) — xem
// computeMotherStockBalance để biết cách dựng lại đúng số tồn tại 1 mốc quá khứ chỉ từ các bảng giao dịch
// hiện có, và cách cache lại kết quả của các tuần đã chốt vào MotherStockWeekSnapshot.

export type PlantTypeGrowthRow = {
  plantTypeId: string;
  code: string;
  name: string;
  startBalance: number;
  endBalance: number;
  remainingHandedOver: number;
  sentToOtherFacilities: number;
  growth: number;
};

// Dựng lại tồn mẫu mẹ (MAU_ME) trên các giàn Phòng mẫu mẹ của 1 kho sản xuất, TẠI ĐÚNG 1 mốc thời gian
// `asOf`, cho 1 mã cây cụ thể — không cần bảng ledger sự kiện riêng vì:
//   - Lot.enteredAt là mốc lô LÊN KỆ kho sáng, không bao giờ bị ghi đè lại bởi thao tác dồn giàn trong
//     cùng kho (xem src/lib/mother-stock-reshelf.ts) — dùng thẳng làm mốc "đã có mặt kể từ khi nào".
//   - Khi lô được dùng làm nguồn cho 1 chỉ định đã bàn giao, quantity KHÔNG bị trừ — chỉ đổi
//     status ACTIVE → PLANTED (xem markSourceLotsPlanted, src/app/api/instructions/[id]/route.ts) — nên
//     phải loại các lô đã PLANTED nếu instruction.handedOverAt <= asOf (đã dùng ở thời điểm đó), vẫn tính
//     nếu handedOverAt > asOf (chưa dùng ở thời điểm đó).
//   - Chuyển mẫu mẹ liên kho (sendMotherStockToWarehouse) trừ thẳng quantity của lô nguồn ngay lúc gửi —
//     nên với asOf TRƯỚC thời điểm gửi (Transfer.transferredAt), phải cộng bù lại đúng số đã trừ.
async function computeRawBalanceForPlantType(warehouseId: string, plantTypeId: string, asOf: Date): Promise<number> {
  const lots = await prisma.lot.findMany({
    where: {
      stage: "MAU_ME",
      plantTypeId,
      shelf: { warehouseId, room: { type: "PHONG_MAU_ME" } },
      enteredAt: { lte: asOf },
    },
    select: {
      quantity: true,
      status: true,
      instructionItems: { select: { instruction: { select: { handedOverAt: true } } }, take: 1 },
    },
  });

  let total = 0;
  for (const lot of lots) {
    const handedOverAt = lot.instructionItems[0]?.instruction.handedOverAt ?? null;
    const consumedByAsOf = lot.status === "PLANTED" && handedOverAt !== null && handedOverAt.getTime() <= asOf.getTime();
    if (!consumedByAsOf) total += lot.quantity;
  }

  const futureSends = await prisma.transferItem.findMany({
    where: {
      transfer: { fromWarehouseId: warehouseId, notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG }, transferredAt: { gt: asOf } },
      lot: { stage: "MAU_ME", plantTypeId },
    },
    select: { quantity: true },
  });
  total += futureSends.reduce((s, i) => s + i.quantity, 0);

  return total;
}

// Tồn tại 1 mốc quá khứ (Chủ nhật đã qua) không đổi nữa — cache lại vào MotherStockWeekSnapshot để lần sau
// khỏi tính lại. Tuần đang chạy dở (asOf ở tương lai gần/hôm nay) luôn tính sống, không lưu cache.
async function getBalanceForPlantType(warehouseId: string, plantTypeId: string, weekEndDate: Date): Promise<number> {
  const isClosedWeek = weekEndDate.getTime() < Date.now();

  if (isClosedWeek) {
    const cached = await prisma.motherStockWeekSnapshot.findUnique({
      where: { warehouseId_plantTypeId_weekEndDate: { warehouseId, plantTypeId, weekEndDate } },
    });
    if (cached) return cached.quantity;
  }

  const quantity = await computeRawBalanceForPlantType(warehouseId, plantTypeId, weekEndDate);

  if (isClosedWeek) {
    await prisma.motherStockWeekSnapshot.upsert({
      where: { warehouseId_plantTypeId_weekEndDate: { warehouseId, plantTypeId, weekEndDate } },
      create: { warehouseId, plantTypeId, weekEndDate, quantity },
      update: { quantity, computedAt: new Date() },
    });
  }

  return quantity;
}

// Phần mẫu mẹ trong các chỉ định ĐÃ bàn giao (handedOverAt <= asOf) nhưng NV chưa cấy hết — đã trừ phần MM
// dư đã bàn giao lại và ĐÃ lên kệ kho sáng (Lot.instructionId, xem surplus-handover/route.ts) để không đếm
// trùng với computeRawBalanceForPlantType (phần đó đã nằm trong tồn cuối kỳ rồi). Tính cả chỉ định đã ENDED
// còn dư chưa bàn giao lại — theo đúng xác nhận của Admin.
async function computeRemainingHandedOverMother(warehouseId: string, plantTypeId: string, asOf: Date): Promise<number> {
  const instructions = await prisma.plantingInstruction.findMany({
    where: {
      plantTypeId,
      handedOverAt: { not: null, lte: asOf },
      items: { some: { shelf: { warehouseId } } },
    },
    select: {
      id: true,
      inputMotherQuantity: true,
      dailyRecords: { where: { recordDate: { lte: asOf } }, select: { motherUsed: true } },
    },
  });
  if (instructions.length === 0) return 0;

  const surplusLots = await prisma.lot.findMany({
    where: { instructionId: { in: instructions.map((i) => i.id) }, stage: "MAU_ME", enteredAt: { lte: asOf } },
    select: { instructionId: true, quantity: true },
  });
  const surplusByInstruction = new Map<string, number>();
  for (const lot of surplusLots) {
    if (!lot.instructionId) continue;
    surplusByInstruction.set(lot.instructionId, (surplusByInstruction.get(lot.instructionId) ?? 0) + lot.quantity);
  }

  return instructions.reduce((total, instr) => {
    const used = instr.dailyRecords.reduce((s, r) => s + r.motherUsed, 0);
    const alreadyReturned = surplusByInstruction.get(instr.id) ?? 0;
    return total + Math.max(0, instr.inputMotherQuantity - used - alreadyReturned);
  }, 0);
}

// Số mẫu mẹ đã chuyển đi 1 cơ sở khác trong khoảng (afterExclusive, uptoInclusive] — cộng bù vào số gia
// tăng vì đây vẫn là sản lượng cơ sở này làm ra (không bị trừ như 1 quy tắc riêng của báo cáo này).
async function computeSentToOtherFacilities(
  warehouseId: string,
  plantTypeId: string,
  afterExclusive: Date,
  uptoInclusive: Date
): Promise<number> {
  const items = await prisma.transferItem.findMany({
    where: {
      transfer: {
        fromWarehouseId: warehouseId,
        notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG },
        transferredAt: { gt: afterExclusive, lte: uptoInclusive },
      },
      lot: { stage: "MAU_ME", plantTypeId },
    },
    select: { quantity: true },
  });
  return items.reduce((s, i) => s + i.quantity, 0);
}

// Mọi mã cây từng có mẫu mẹ trên giàn Phòng mẫu mẹ của kho này — dùng làm phạm vi khi Admin chọn "Tất cả".
async function getRelevantPlantTypeIds(warehouseId: string): Promise<string[]> {
  const rows = await prisma.lot.findMany({
    where: { stage: "MAU_ME", shelf: { warehouseId, room: { type: "PHONG_MAU_ME" } } },
    distinct: ["plantTypeId"],
    select: { plantTypeId: true },
  });
  return rows.map((r) => r.plantTypeId);
}

// `weekNStart` = Thứ 2 đầu tuần n, `weekNPlusXStart` = Thứ 2 đầu tuần n+x (tuần cuối của khoảng đang xem).
export async function computeMotherStockGrowth(
  warehouseId: string,
  plantTypeId: string | null,
  weekNStart: Date,
  weekNPlusXStart: Date
): Promise<PlantTypeGrowthRow[]> {
  const weekNMinus1End = endOfWeek(subWeeks(weekNStart, 1), { weekStartsOn: 1 });
  const weekNPlusXEnd = endOfWeek(weekNPlusXStart, { weekStartsOn: 1 });

  const plantTypeIds = plantTypeId ? [plantTypeId] : await getRelevantPlantTypeIds(warehouseId);
  if (plantTypeIds.length === 0) return [];

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: plantTypeIds } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const rows = await Promise.all(
    plantTypes.map(async (pt): Promise<PlantTypeGrowthRow> => {
      const [startBalance, endBalance, remainingHandedOver, sentToOtherFacilities] = await Promise.all([
        getBalanceForPlantType(warehouseId, pt.id, weekNMinus1End),
        getBalanceForPlantType(warehouseId, pt.id, weekNPlusXEnd),
        computeRemainingHandedOverMother(warehouseId, pt.id, weekNPlusXEnd),
        computeSentToOtherFacilities(warehouseId, pt.id, weekNMinus1End, weekNPlusXEnd),
      ]);
      const growth = endBalance - startBalance + remainingHandedOver + sentToOtherFacilities;
      return { plantTypeId: pt.id, code: pt.code, name: pt.name, startBalance, endBalance, remainingHandedOver, sentToOtherFacilities, growth };
    })
  );

  return rows;
}
