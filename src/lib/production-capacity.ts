import { prisma } from "@/lib/prisma";
import type { WeekBucket } from "@/lib/report-utils";
import { getCurrentWeekSlot } from "@/lib/week-rotation";
import { getMotherRotationEpoch } from "@/lib/mother-week-group";

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

// Bước A — hệ số nhân MM / hệ số ra rễ TP trung bình của 3 kỳ liền trước prevBuckets (đã loại chỉ định
// dự phòng, gộp thẳng theo từng (nhân sự, kỳ) rồi trung bình cộng — không trung bình theo NV trước).
export async function computeAverageRatios(
  plantTypeId: string,
  prevBuckets: WeekBucket[],
  scope: CapacityScope
): Promise<{ avgRatioMM: number; avgRatioTP: number }> {
  if (prevBuckets.length === 0) return { avgRatioMM: 0, avgRatioTP: 0 };
  const scopedStaffIds = await resolveScopedStaffIds(scope);
  const rows = await fetchDailyRecords(plantTypeId, prevBuckets[0].start, prevBuckets[prevBuckets.length - 1].end, scopedStaffIds, false);

  // Gộp theo (staffId, bucketIndex) — mỗi tổ hợp là 1 giá trị trong phép trung bình cuối.
  const byStaffBucket = new Map<string, OutputRow[]>();
  for (const r of rows) {
    const idx = prevBuckets.findIndex((b) => r.recordDate >= b.start && r.recordDate <= b.end);
    if (idx === -1) continue;
    const key = `${r.staffId}|${idx}`;
    const list = byStaffBucket.get(key) ?? [];
    list.push(r);
    byStaffBucket.set(key, list);
  }

  const ratiosMM: number[] = [];
  const ratiosTP: number[] = [];
  for (const groupRows of byStaffBucket.values()) {
    const { motherOutput, finishedOutput, motherUsed } = sumByStage(groupRows);
    if (motherUsed <= 0) continue;
    ratiosMM.push(motherOutput / motherUsed);
    ratiosTP.push(finishedOutput / motherUsed);
  }

  const avg = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length);
  return { avgRatioMM: avg(ratiosMM), avgRatioTP: avg(ratiosTP) };
}

// Tồn M05 "đủ tuổi" — chỉ tính lô thuộc (các) Nhóm tuần mẫu mẹ đang ĐẾN HẠN cấy chuyển HÔM NAY, dùng
// đúng cơ chế xoay vòng giàn đã có (xem src/lib/mother-week-group.ts, N = PlantType.transferWaitWeeks
// của mã cây đang lọc — dùng trực tiếp N này thay vì tra qua shelf.plantType.transferWaitWeeks vì kệ
// "chung" không gán 1 mã cây cố định nên không tra được N qua kệ). KHÁC với đếm TOÀN BỘ tồn M05 active:
// nhiều lô còn non, chưa tới lượt xoay vòng, đếm lẫn vào sẽ thổi phồng "vốn" gấp nhiều lần thực tế. Trả
// 0 nếu SUPER_ADMIN chưa cấu hình "Tuần khởi đầu Nhóm tuần mẫu mẹ 1" hoặc hôm nay còn trước mốc đó — cùng
// quy ước thận trọng như summarizeMotherWeekGroups (không suy đoán khe xoay vòng khi chưa có mốc thật).
async function getDueMotherStock(plantTypeId: string, scope: CapacityScope, now: Date = new Date()): Promise<number> {
  const plantType = await prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { transferWaitWeeks: true } });
  const totalSlots = plantType?.transferWaitWeeks ?? 4;
  const epoch = await getMotherRotationEpoch();
  if (!epoch || now.getTime() < epoch.getTime()) return 0;
  const currentSlot = getCurrentWeekSlot(totalSlots, now, epoch);

  const result = await prisma.lot.aggregate({
    where: {
      status: "ACTIVE",
      stage: "MAU_ME",
      stageCode: "M05",
      plantTypeId,
      shelfId: { not: null },
      shelf: {
        room: { type: "PHONG_MAU_ME" },
        rotationGroup: { rotationOrder: currentSlot },
        ...(scope.kind === "STAFF" ? { assignedStaffId: scope.staffId } : {}),
        ...(scope.kind === "WAREHOUSE" ? { warehouseId: scope.warehouseId } : {}),
      },
    },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

export type CapacityForecast = { motherForecast: number; finishedForecast: number };

// Bước B — hệ số trung bình (Bước A) + "vốn" mẫu mẹ đủ tuổi hiện có, dùng làm gốc cho dự báo cộng dồn
// nhiều kỳ (xem forecastAtStep) — tách riêng khỏi vòng lặp từng kỳ vì cả 2 giá trị này không đổi giữa
// các kỳ tương lai (mô phỏng đơn giản: 1 vốn ban đầu, nhân luỹ thừa hệ số liên tục qua từng kỳ).
export async function getForecastBasis(
  plantTypeId: string,
  prevBuckets: WeekBucket[],
  scope: CapacityScope
): Promise<{ avgRatioMM: number; avgRatioTP: number; baseMother: number }> {
  const [{ avgRatioMM, avgRatioTP }, baseMother] = await Promise.all([
    computeAverageRatios(plantTypeId, prevBuckets, scope),
    getDueMotherStock(plantTypeId, scope),
  ]);
  return { avgRatioMM, avgRatioTP, baseMother };
}

// Dự báo kỳ tương lai thứ `stepsAhead` (1 = kỳ kế tiếp, 2 = kỳ sau nữa...) — CỘNG DỒN từ baseMother: mẫu
// mẹ dự kiến của 1 kỳ trở thành "vốn" mẫu mẹ cho kỳ sau, nhân tiếp với hệ số nhân MM (mẫu mẹ sinh ra lại
// được đem cấy tiếp) — motherForecast = baseMother × avgRatioMM^stepsAhead. Ra rễ TP luôn tính từ ĐÚNG
// mẫu mẹ dự kiến của kỳ đó (không cộng dồn riêng) — finishedForecast = motherForecast × avgRatioTP.
export function forecastAtStep(basis: { avgRatioMM: number; avgRatioTP: number; baseMother: number }, stepsAhead: number): CapacityForecast {
  const motherForecast = basis.baseMother * Math.pow(basis.avgRatioMM, stepsAhead);
  const finishedForecast = motherForecast * basis.avgRatioTP;
  return { motherForecast, finishedForecast };
}
