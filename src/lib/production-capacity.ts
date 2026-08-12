import { prisma } from "@/lib/prisma";
import type { WeekBucket } from "@/lib/report-utils";
import { getCurrentWeekSlot } from "@/lib/week-rotation";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";
import { startOfWeek, addWeeks } from "date-fns";

// Phạm vi lọc năng suất — ALL = toàn hệ thống, WAREHOUSE = 1 kho sản xuất, STAFF = 1 NV cấy mô. Dùng
// chung cho cả tính hệ số (Bước A) lẫn tồn mẫu mẹ hiện có (Bước B) — xem "Công thức đã chốt" trong plan.
export type CapacityScope = { kind: "ALL" } | { kind: "WAREHOUSE"; warehouseId: string } | { kind: "STAFF"; staffId: string };

// Danh sách userId (CAY_MO) thuộc phạm vi đang lọc — undefined = không giới hạn (ALL), dùng để lọc
// DailyRecord/instruction.assignedToId khi gộp hệ số Bước A và sản lượng thực tế (đường xanh).
async function resolveScopedStaffIds(scope: CapacityScope): Promise<string[] | undefined> {
  if (scope.kind === "STAFF") return [scope.staffId];
  if (scope.kind === "WAREHOUSE") {
    const staff = await prisma.user.findMany({
      where: { role: "CAY_MO", workplaceWarehouseId: scope.warehouseId },
      select: { id: true },
    });
    return staff.map((s) => s.id);
  }
  return undefined;
}

type OutputRow = { staffId: string; recordDate: Date; motherUsed: number; items: { stage: "MAU_ME" | "THANH_PHAM"; quantityCreated: number }[] };

// Truy vấn thô DailyRecord của đúng mã cây/khoảng thời gian/phạm vi — dùng chung cho cả đường xanh
// (sản lượng thực tế, includeBackup=true) lẫn Bước A (hệ số dự báo, includeBackup=false).
async function fetchDailyRecords(
  plantTypeId: string,
  rangeStart: Date,
  rangeEnd: Date,
  scopedStaffIds: string[] | undefined,
  includeBackup: boolean
): Promise<OutputRow[]> {
  const records = await prisma.dailyRecord.findMany({
    where: {
      recordDate: { gte: rangeStart, lte: rangeEnd },
      instruction: {
        plantTypeId,
        assignedToId: scopedStaffIds ? { in: scopedStaffIds } : { not: null },
        ...(includeBackup ? {} : { isBackup: false }),
      },
    },
    select: {
      staffId: true,
      recordDate: true,
      motherUsed: true,
      items: { select: { stage: true, quantityCreated: true } },
    },
  });
  return records;
}

function sumByStage(rows: OutputRow[]): { motherOutput: number; finishedOutput: number; motherUsed: number } {
  let motherOutput = 0;
  let finishedOutput = 0;
  let motherUsed = 0;
  for (const r of rows) {
    motherUsed += r.motherUsed;
    for (const item of r.items) {
      if (item.stage === "MAU_ME") motherOutput += item.quantityCreated;
      else finishedOutput += item.quantityCreated;
    }
  }
  return { motherOutput, finishedOutput, motherUsed };
}

export type ActualPoint = { motherOutput: number; finishedOutput: number };

// Đường XANH — sản lượng thực tế mỗi kỳ (bucket), tính TẤT CẢ chỉ định (kể cả dự phòng) vì đây là sản
// lượng THẬT đã cấy ra, không phải hệ số dự báo — khác Bước A (computeAverageRatios) chỉ lấy chỉ định
// thường. Trả về mảng đúng thứ tự buckets.
export async function computeActualSeries(plantTypeId: string, buckets: WeekBucket[], scope: CapacityScope): Promise<ActualPoint[]> {
  const scopedStaffIds = await resolveScopedStaffIds(scope);
  if (buckets.length === 0) return [];
  const rows = await fetchDailyRecords(plantTypeId, buckets[0].start, buckets[buckets.length - 1].end, scopedStaffIds, true);

  const points: ActualPoint[] = buckets.map(() => ({ motherOutput: 0, finishedOutput: 0 }));
  for (const r of rows) {
    const idx = buckets.findIndex((b) => r.recordDate >= b.start && r.recordDate <= b.end);
    if (idx === -1) continue;
    for (const item of r.items) {
      if (item.stage === "MAU_ME") points[idx].motherOutput += item.quantityCreated;
      else points[idx].finishedOutput += item.quantityCreated;
    }
  }
  return points;
}

// Bước A — hệ số nhân MM / hệ số ra rễ TP / năng suất mẫu mẹ mỗi NV mỗi NGÀY, tất cả tính trên 3 TUẦN
// GẦN NHẤT CÓ DỮ LIỆU (không nhất thiết liền kề, không bao giờ tính tuần ở tương lai — đã loại chỉ định
// dự phòng), LUÔN gộp theo lưới TUẦN thật bất kể đơn vị biểu đồ đang xem Tuần hay Tháng. KHÁC bản trước
// (gộp cứng theo 3 kỳ dương lịch liền trước "kỳ hiện tại" của đúng đơn vị đang chọn): với đơn vị Tháng,
// đòi hỏi đủ 3 THÁNG dữ liệu thật nên hệ thống còn ít lịch sử (VD mới chạy vài tuần) sẽ ra hệ số=0 suốt
// nhiều tháng đầu dù đã có dữ liệu thật gần đây — nay chỉ cần có dữ liệu ở BẤT KỲ tuần nào trong quá khứ
// (kể cả chỉ 1-2 tuần) là tính được ngay, lấy tối đa 3 tuần gần nhất, ít hơn 3 vẫn dùng được. avgRatioMM/
// avgRatioTP gộp thẳng theo từng (nhân sự, tuần) rồi trung bình cộng — không trung bình theo NV trước.
// avgMotherPerStaffDay gộp theo (nhân sự, NGÀY) — 1 NV có thể có nhiều DailyRecord trong 1 ngày (nhiều
// chỉ định khác nhau), cộng dồn motherUsed đúng ngày đó trước khi đưa vào trung bình — dùng để quy đổi
// "tổng mẫu mẹ cần cấy" ra "số ngày công cần" ở phần Dự đoán nhân sự (xem estimateStaffingNeed).
export async function computeAverageRatios(
  plantTypeId: string,
  now: Date,
  scope: CapacityScope
): Promise<{ avgRatioMM: number; avgRatioTP: number; avgMotherPerStaffDay: number }> {
  const scopedStaffIds = await resolveScopedStaffIds(scope);
  const rows = await fetchDailyRecords(plantTypeId, new Date(0), now, scopedStaffIds, false);

  const weekStartOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 }).getTime();
  const recentWeekStarts = [...new Set(rows.map((r) => weekStartOf(r.recordDate)))].sort((a, b) => b - a).slice(0, 3);
  const recentWeekSet = new Set(recentWeekStarts);
  const relevantRows = rows.filter((r) => recentWeekSet.has(weekStartOf(r.recordDate)));

  // Gộp theo (staffId, đầu tuần) — mỗi tổ hợp là 1 giá trị trong phép trung bình hệ số MM/TP.
  const byStaffWeek = new Map<string, OutputRow[]>();
  for (const r of relevantRows) {
    const key = `${r.staffId}|${weekStartOf(r.recordDate)}`;
    const list = byStaffWeek.get(key) ?? [];
    list.push(r);
    byStaffWeek.set(key, list);
  }

  const ratiosMM: number[] = [];
  const ratiosTP: number[] = [];
  for (const groupRows of byStaffWeek.values()) {
    const { motherOutput, finishedOutput, motherUsed } = sumByStage(groupRows);
    if (motherUsed <= 0) continue;
    ratiosMM.push(motherOutput / motherUsed);
    ratiosTP.push(finishedOutput / motherUsed);
  }

  // Gộp theo (staffId, ngày) — mỗi tổ hợp là 1 giá trị trong phép trung bình năng suất/ngày.
  const dayKeyOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const motherUsedByStaffDay = new Map<string, number>();
  for (const r of relevantRows) {
    const key = `${r.staffId}|${dayKeyOf(r.recordDate)}`;
    motherUsedByStaffDay.set(key, (motherUsedByStaffDay.get(key) ?? 0) + r.motherUsed);
  }
  const perStaffDayValues = [...motherUsedByStaffDay.values()].filter((v) => v > 0);

  const avg = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length);
  return { avgRatioMM: avg(ratiosMM), avgRatioTP: avg(ratiosTP), avgMotherPerStaffDay: avg(perStaffDayValues) };
}

type RotationGroupStock = { groupId: string; rotationOrder: number; stock: number };

// Tồn M05 hiện có của TỪNG Nhóm tuần mẫu mẹ (rotationGroup) riêng biệt — KHÁC bản trước (chỉ tính đúng 1
// Nhóm đang đến hạn hôm nay): qua nhiều tuần/tháng, LẦN LƯỢT cả N Nhóm đều tới lượt cấy chuyển (mỗi tuần 1
// Nhóm khác nhau, xoay hết vòng N tuần lại quay về Nhóm đầu) — nếu chỉ tính vốn của 1 Nhóm áp dụng cho
// toàn bộ tương lai thì bỏ sót tồn của N-1 Nhóm còn lại, ước lượng thấp hơn thực tế nhiều lần (VD 6 Nhóm
// mỗi Nhóm vài nghìn cây, tính 1 Nhóm thì hụt 5/6 sản lượng thật). Bỏ qua giàn chưa gán Nhóm
// (rotationGroupId null) — không xác định được lịch xoay vòng nên không đưa vào mô phỏng được.
async function getRotationGroupsWithStock(plantTypeId: string, scope: CapacityScope): Promise<RotationGroupStock[]> {
  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      stage: "MAU_ME",
      stageCode: "M05",
      plantTypeId,
      shelfId: { not: null },
      shelf: {
        room: { type: "PHONG_MAU_ME" },
        rotationGroupId: { not: null },
        ...(scope.kind === "STAFF" ? { assignedStaffId: scope.staffId } : {}),
        ...(scope.kind === "WAREHOUSE" ? { warehouseId: scope.warehouseId } : {}),
      },
    },
    select: { quantity: true, shelf: { select: { rotationGroupId: true, rotationGroup: { select: { rotationOrder: true } } } } },
  });

  const byGroup = new Map<string, RotationGroupStock>();
  for (const lot of lots) {
    const groupId = lot.shelf!.rotationGroupId!;
    const rotationOrder = lot.shelf!.rotationGroup?.rotationOrder;
    if (rotationOrder == null) continue;
    const entry = byGroup.get(groupId) ?? { groupId, rotationOrder, stock: 0 };
    entry.stock += lot.quantity;
    byGroup.set(groupId, entry);
  }
  return Array.from(byGroup.values());
}

export type WeeklyForecastPoint = { weekStart: Date; motherForecast: number; finishedForecast: number; motherProcessed: number };

// Mô phỏng dự báo TỪNG TUẦN từ tuần kế tiếp tới "until" — đúng nghiệp vụ xoay vòng: mỗi tuần chỉ (các)
// Nhóm tuần mẫu mẹ ĐÚNG LƯỢT (rotationOrder khớp khe tuần đó, xem getCurrentWeekSlot) mới được "cấy". Mỗi
// Nhóm có 1 chuỗi cộng dồn RIÊNG, cách nhau đúng N tuần (transferWaitWeeks): lần đầu dùng tồn thật hiện
// có của Nhóm đó, các lần sau dùng mẫu mẹ dự kiến của LẦN CẤY TRƯỚC của CHÍNH Nhóm đó (không trộn lẫn
// giữa các Nhóm). motherProcessed = tổng "vốn" mẫu mẹ ĐEM CẤY tuần đó (trước khi nhân hệ số) — dùng ở
// estimateStaffingNeed để quy ra số ngày công/nhân sự cần, khác motherForecast (mẫu mẹ SINH RA sau cấy).
// Trả mảng rỗng nếu SUPER_ADMIN chưa cấu hình "Tuần khởi đầu Nhóm tuần mẫu mẹ 1" — không suy đoán lịch
// xoay vòng khi chưa có mốc thật (cùng quy ước thận trọng như summarizeMotherWeekGroups).
export async function simulateWeeklyForecast(
  plantTypeId: string,
  scope: CapacityScope,
  now: Date,
  until: Date
): Promise<WeeklyForecastPoint[]> {
  const [plantType, epoch, { avgRatioMM, avgRatioTP }, groups] = await Promise.all([
    prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { transferWaitWeeks: true } }),
    getMotherRotationEpoch(),
    computeAverageRatios(plantTypeId, now, scope),
    getRotationGroupsWithStock(plantTypeId, scope),
  ]);
  if (!epoch) return [];
  const totalSlots = plantType?.transferWaitWeeks ?? 4;

  const stockByGroup = new Map(groups.map((g) => [g.groupId, g.stock]));

  const points: WeeklyForecastPoint[] = [];
  let weekStart = startOfWeek(addWeeks(now, 1), { weekStartsOn: 1 });
  while (weekStart.getTime() <= until.getTime()) {
    let motherForecast = 0;
    let finishedForecast = 0;
    let motherProcessed = 0;
    if (weekStart.getTime() >= epoch.getTime()) {
      const slot = getCurrentWeekSlot(totalSlots, weekStart, epoch);
      for (const g of groups) {
        if (g.rotationOrder !== slot) continue;
        const stock = stockByGroup.get(g.groupId) ?? 0;
        const mOut = stock * avgRatioMM;
        const fOut = mOut * avgRatioTP;
        motherForecast += mOut;
        finishedForecast += fOut;
        motherProcessed += stock;
        stockByGroup.set(g.groupId, mOut);
      }
    }
    points.push({ weekStart, motherForecast, finishedForecast, motherProcessed });
    weekStart = addWeeks(weekStart, 1);
  }
  return points;
}
