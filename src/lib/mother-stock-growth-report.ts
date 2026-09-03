import { endOfWeek, startOfWeek, subWeeks } from "date-fns";
import { prisma } from "@/lib/prisma";
import { MOTHER_WAREHOUSE_TRANSFER_TAG } from "@/types";
import { getWeekBucketsInRange } from "@/lib/report-utils";

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
//     + Số mẫu mẹ đang nằm trong phòng tối cá nhân của NV cấy mô (đã nhập nhật ký cấy, tạo ra lô, nhưng
//       Kho mô CHƯA xác nhận bàn giao lên kệ kho sáng) tính đến hết tuần n+x — đã sản xuất ra rồi, chỉ
//       chưa kịp lên kệ nên chưa nằm trong "Tồn kho sáng cuối kỳ".
//
// Hệ thống không lưu lịch sử tồn kho/số liệu theo thời điểm ở đâu khác — mọi con số trên đều phải dựng lại
// từ các bảng giao dịch hiện có mỗi lần cần. Để KHÔNG phải dựng lại từ đầu mỗi lần Admin bấm "Lọc dữ liệu"
// (nặng dần khi dữ liệu càng nhiều), toàn bộ 4 con số của 1 (kho, mã cây, tuần) được cache CHUNG 1 lần vào
// MotherStockWeekSnapshot ngay khi tuần đó đã CHỐT (đã qua hết Chủ nhật) — xem getWeekSnapshot. Tuần đang
// chạy dở (chưa qua hết Chủ nhật) luôn tính sống, không cache.

export type PlantTypeGrowthRow = {
  plantTypeId: string;
  code: string;
  name: string;
  startBalance: number;
  endBalance: number;
  remainingHandedOver: number;
  sentToOtherFacilities: number;
  unshelvedInDarkRoom: number;
  growth: number;
};

type WeekSnapshotValues = {
  endingBalance: number;
  remainingHandedOver: number;
  unshelvedInDarkRoom: number;
  sentToOtherFacilitiesInWeek: number;
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

  // Chỉ cộng bù nếu chính lô đó đã có mặt (enteredAt <= asOf) — tức đã được tính trong tổng ở trên rồi mới
  // bị trừ bởi lần gửi sau đó. Thiếu điều kiện này sẽ cộng nhầm cho asOf ở TRƯỚC cả lúc lô lên kệ (lô chưa
  // hề tồn tại ở mốc đó, không nằm trong tổng để mà cần cộng bù).
  const futureSends = await prisma.transferItem.findMany({
    where: {
      transfer: { fromWarehouseId: warehouseId, notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG }, transferredAt: { gt: asOf } },
      lot: { stage: "MAU_ME", plantTypeId, enteredAt: { lte: asOf } },
    },
    select: { quantity: true },
  });
  total += futureSends.reduce((s, i) => s + i.quantity, 0);

  return total;
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

// Mẫu mẹ đã nhập nhật ký cấy (đã tạo Lot ở phòng tối cá nhân của NV cấy mô) nhưng Kho mô CHƯA xác nhận bàn
// giao lên kệ kho sáng — lô này vẫn còn roomId (Phòng tối), chưa có shelfId. Dùng darkRoomEnteredAt (mốc
// nhập kho tối gốc, bất biến) để lọc theo asOf — enteredAt không dùng được ở đây vì với lô CHƯA lên kệ,
// enteredAt vẫn = lúc tạo lô (chưa bị commitShelfPlacements ghi đè).
// Giới hạn chấp nhận được: chỉ xét đúng trạng thái HIỆN TẠI (lô còn nằm phòng tối ngay lúc tính) — không
// dựng lại lịch sử "còn ở phòng tối tính đến 1 mốc quá khứ xa" vì lô đã lên kệ thì roomId bị xoá hẳn, không
// còn cách xác định ngược. Vì vậy giá trị này ĐƯỢC PHÉP cache cùng cả tuần khi tuần đó chốt lần đầu (xem
// getWeekSnapshot) — tính lại sau này (sau khi lô đã lên kệ) sẽ chỉ làm số bị THIẾU đi, không chính xác
// hơn, nên cache lần tính đầu tiên (gần thời điểm tuần chốt nhất) là bản tốt nhất có thể có.
async function computeUnshelvedDarkRoomMother(warehouseId: string, plantTypeId: string, asOf: Date): Promise<number> {
  const lots = await prisma.lot.findMany({
    where: {
      stage: "MAU_ME",
      plantTypeId,
      status: "ACTIVE",
      darkRoomEnteredAt: { not: null, lte: asOf },
      room: { warehouseId, type: "PHONG_TOI" },
    },
    select: { quantity: true },
  });
  return lots.reduce((s, l) => s + l.quantity, 0);
}

// Số mẫu mẹ đã chuyển đi 1 cơ sở khác PHÁT SINH TRONG TUẦN chứa `weekEndDate` (Thứ 2 - Chủ nhật) — cộng bù
// vào số gia tăng vì đây vẫn là sản lượng cơ sở này làm ra (không bị trừ như 1 quy tắc riêng của báo cáo
// này). Tính theo TỪNG TUẦN (không theo cả khoảng) để cache được độc lập từng tuần, rồi cộng dồn nhiều tuần
// liên tiếp khi Admin chọn khoảng nhiều tuần — xem computeMotherStockGrowth.
async function computeSentToOtherFacilitiesInWeek(warehouseId: string, plantTypeId: string, weekEndDate: Date): Promise<number> {
  const weekStart = startOfWeek(weekEndDate, { weekStartsOn: 1 });
  const items = await prisma.transferItem.findMany({
    where: {
      transfer: {
        fromWarehouseId: warehouseId,
        notes: { startsWith: MOTHER_WAREHOUSE_TRANSFER_TAG },
        transferredAt: { gte: weekStart, lte: weekEndDate },
      },
      lot: { stage: "MAU_ME", plantTypeId },
    },
    select: { quantity: true },
  });
  return items.reduce((s, i) => s + i.quantity, 0);
}

async function computeWeekSnapshotValues(warehouseId: string, plantTypeId: string, weekEndDate: Date): Promise<WeekSnapshotValues> {
  const [endingBalance, remainingHandedOver, unshelvedInDarkRoom, sentToOtherFacilitiesInWeek] = await Promise.all([
    computeRawBalanceForPlantType(warehouseId, plantTypeId, weekEndDate),
    computeRemainingHandedOverMother(warehouseId, plantTypeId, weekEndDate),
    computeUnshelvedDarkRoomMother(warehouseId, plantTypeId, weekEndDate),
    computeSentToOtherFacilitiesInWeek(warehouseId, plantTypeId, weekEndDate),
  ]);
  return { endingBalance, remainingHandedOver, unshelvedInDarkRoom, sentToOtherFacilitiesInWeek };
}

// Toàn bộ số liệu 1 tuần (Thứ 2 - Chủ nhật chứa weekEndDate) của 1 (kho, mã cây) — tuần đã CHỐT (đã qua hết
// Chủ nhật) thì đọc/ghi cache MotherStockWeekSnapshot, khỏi tính lại ở lần gọi sau. Tuần đang chạy dở luôn
// tính sống (số còn đổi mỗi ngày, không thể chốt cache).
async function getWeekSnapshot(warehouseId: string, plantTypeId: string, weekEndDate: Date): Promise<WeekSnapshotValues> {
  const isClosedWeek = weekEndDate.getTime() < Date.now();

  if (isClosedWeek) {
    const cached = await prisma.motherStockWeekSnapshot.findUnique({
      where: { warehouseId_plantTypeId_weekEndDate: { warehouseId, plantTypeId, weekEndDate } },
    });
    if (cached) {
      return {
        endingBalance: cached.endingBalance,
        remainingHandedOver: cached.remainingHandedOver,
        unshelvedInDarkRoom: cached.unshelvedInDarkRoom,
        sentToOtherFacilitiesInWeek: cached.sentToOtherFacilitiesInWeek,
      };
    }
  }

  const values = await computeWeekSnapshotValues(warehouseId, plantTypeId, weekEndDate);

  if (isClosedWeek) {
    await prisma.motherStockWeekSnapshot.upsert({
      where: { warehouseId_plantTypeId_weekEndDate: { warehouseId, plantTypeId, weekEndDate } },
      create: { warehouseId, plantTypeId, weekEndDate, ...values },
      update: { ...values, computedAt: new Date() },
    });
  }

  return values;
}

// Mọi mã cây từng có mẫu mẹ trên giàn Phòng mẫu mẹ, HOẶC đang nằm phòng tối chưa lên kệ, của kho này —
// dùng làm phạm vi khi Admin chọn "Tất cả" (không chỉ nhìn giàn kệ, kẻo bỏ sót mã cây mới chỉ vừa nhập
// nhật ký cấy lần đầu, chưa từng có lô nào lên kệ).
async function getRelevantPlantTypeIds(warehouseId: string): Promise<string[]> {
  const [shelved, unshelved] = await Promise.all([
    prisma.lot.findMany({
      where: { stage: "MAU_ME", shelf: { warehouseId, room: { type: "PHONG_MAU_ME" } } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
    prisma.lot.findMany({
      where: { stage: "MAU_ME", status: "ACTIVE", room: { warehouseId, type: "PHONG_TOI" } },
      distinct: ["plantTypeId"],
      select: { plantTypeId: true },
    }),
  ]);
  return Array.from(new Set([...shelved, ...unshelved].map((r) => r.plantTypeId)));
}

// `weekNStart` = Thứ 2 đầu tuần n, `weekNPlusXStart` = Thứ 2 đầu tuần n+x (tuần cuối của khoảng đang xem).
// `plantTypeIds` rỗng = "Tất cả" (mọi mã cây liên quan tới kho này) — FE cho tích chọn nhiều mã cùng lúc.
export async function computeMotherStockGrowth(
  warehouseId: string,
  plantTypeIds: string[],
  weekNStart: Date,
  weekNPlusXStart: Date
): Promise<PlantTypeGrowthRow[]> {
  const weekNMinus1End = endOfWeek(subWeeks(weekNStart, 1), { weekStartsOn: 1 });
  // Mọi mốc cuối tuần từ tuần n đến tuần n+x — dùng để cộng dồn "đã chuyển cơ sở khác" từng tuần (tái
  // dùng getWeekBucketsInRange đã có sẵn week-math, không viết lại).
  const rangeWeekEndDates = getWeekBucketsInRange(weekNStart, weekNPlusXStart).map((b) => endOfWeek(b.start, { weekStartsOn: 1 }));

  const resolvedPlantTypeIds = plantTypeIds.length > 0 ? plantTypeIds : await getRelevantPlantTypeIds(warehouseId);
  if (resolvedPlantTypeIds.length === 0) return [];

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: resolvedPlantTypeIds } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const rows = await Promise.all(
    plantTypes.map(async (pt): Promise<PlantTypeGrowthRow> => {
      const [startSnapshot, ...rangeSnapshots] = await Promise.all([
        getWeekSnapshot(warehouseId, pt.id, weekNMinus1End),
        ...rangeWeekEndDates.map((d) => getWeekSnapshot(warehouseId, pt.id, d)),
      ]);
      const endSnapshot = rangeSnapshots[rangeSnapshots.length - 1];
      const sentToOtherFacilities = rangeSnapshots.reduce((s, snap) => s + snap.sentToOtherFacilitiesInWeek, 0);
      const growth =
        endSnapshot.endingBalance - startSnapshot.endingBalance + endSnapshot.remainingHandedOver + sentToOtherFacilities + endSnapshot.unshelvedInDarkRoom;
      return {
        plantTypeId: pt.id,
        code: pt.code,
        name: pt.name,
        startBalance: startSnapshot.endingBalance,
        endBalance: endSnapshot.endingBalance,
        remainingHandedOver: endSnapshot.remainingHandedOver,
        sentToOtherFacilities,
        unshelvedInDarkRoom: endSnapshot.unshelvedInDarkRoom,
        growth,
      };
    })
  );

  return rows;
}
