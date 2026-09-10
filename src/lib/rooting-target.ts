import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subDays, subMonths, eachDayOfInterval, format } from "date-fns";

// Chỉ tiêu "cây ra rễ" CÁ NHÂN của 1 NV cấy mô — hiện ở cả dashboard nâng cao (/dashboard) lẫn cơ bản
// (/dashboard-basic). CÙNG công thức với widget "Cây ra rễ" theo khu sản xuất của Admin kỹ thuật/NV Kỹ
// thuật/Kho mô (xem getRootingLast7DaysByWarehouse trong dashboard/page.tsx) nhưng lọc theo ĐÚNG NV này
// (RootingForecastEntry.assignedStaffId — kế hoạch vốn đã gán thẳng cho từng NV cấy mô, không cần lọc qua
// khu sản xuất) thay vì gộp cả cơ sở.
//
// "Ngày làm việc trong tháng" = số ngày trong tháng TRỪ Chủ nhật VÀ ngày lễ (PublicHoliday) — khớp công
// thức "ngày công tiêu chuẩn" ở Bảng lương (payroll-calculation.ts). Luỹ kế "còn thiếu" tính chỉ tiêu ĐẾN
// HẾT HÔM QUA (không tính hôm nay — ngày chưa qua hết) so với thực tế đã ghi nhận từ đầu tháng tới hết hôm
// qua — dương = còn thiếu, âm/0 = đã đạt/vượt (khớp quyết định đã chốt cho widget theo khu sản xuất, xem
// trao đổi 10/09/2026).
//
// taskMonth được LƯU dưới dạng UTC-midnight (xem getTaskMonth trong rooting-forecast.ts) — round-trip qua
// chuỗi "yyyy-MM-dd" để ép về đúng UTC-midnight trước khi subMonths, tránh lệch múi giờ server (bug đã sửa
// ở widget theo khu sản xuất, xem trao đổi 10/09/2026).
export type CayMoRootingTarget = {
  monthlyPlanQuantity: number;
  workingDaysInMonth: number;
  dailyTargetQuantity: number;
  todayQuantity: number;
  deficitQuantity: number; // dương = còn thiếu tính đến hết hôm qua, âm/0 = đã đạt/vượt
};

function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function sumFinished(records: { items: { stage: string; quantityCreated: number }[] }[]): number {
  return records.reduce(
    (s, r) => s + r.items.filter((i) => i.stage === "THANH_PHAM").reduce((s2, i) => s2 + i.quantityCreated, 0),
    0
  );
}

// Trả về null nếu tháng này NV chưa được gán kế hoạch nào (ẩn hẳn khối chỉ tiêu, không hiện "0 cây/ngày"
// vô nghĩa).
export async function computeCayMoRootingTarget(staffId: string): Promise<CayMoRootingTarget | null> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterday = subDays(todayStart, 1);
  const elapsedEnd = yesterday < monthStart ? null : yesterday;

  const monthStartUtcMidnight = new Date(format(monthStart, "yyyy-MM-dd"));
  const t1 = subMonths(monthStartUtcMidnight, 1);
  const t2 = subMonths(monthStartUtcMidnight, 2);
  const t3 = subMonths(monthStartUtcMidnight, 3);

  const [planRows, holidays, todayRecords, monthToDateRecords] = await Promise.all([
    prisma.rootingForecastEntry.groupBy({
      by: ["taskMonth"],
      where: { assignedStaffId: staffId, taskMonth: { in: [t1, t2, t3] } },
      _sum: { quantity1: true, quantity2: true, quantity3: true },
    }),
    prisma.publicHoliday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.dailyRecord.findMany({
      where: { staffId, recordDate: { gte: todayStart, lte: todayEnd } },
      select: { items: { select: { stage: true, quantityCreated: true } } },
    }),
    elapsedEnd
      ? prisma.dailyRecord.findMany({
          where: { staffId, recordDate: { gte: monthStart, lte: elapsedEnd } },
          select: { items: { select: { stage: true, quantityCreated: true } } },
        })
      : Promise.resolve([]),
  ]);

  const planByMonth = new Map(
    planRows.map((r) => [dayKey(r.taskMonth), { q1: r._sum.quantity1 ?? 0, q2: r._sum.quantity2 ?? 0, q3: r._sum.quantity3 ?? 0 }])
  );
  const monthlyPlanQuantity =
    (planByMonth.get(dayKey(t1))?.q1 ?? 0) +
    (planByMonth.get(dayKey(t2))?.q2 ?? 0) +
    (planByMonth.get(dayKey(t3))?.q3 ?? 0);
  if (monthlyPlanQuantity <= 0) return null;

  const holidayDayKeys = new Set(holidays.map((h) => dayKey(h.date)));
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const workingDaysInMonth = daysInMonth.filter((d) => d.getDay() !== 0 && !holidayDayKeys.has(dayKey(d))).length;
  const workingDaysElapsed = elapsedEnd
    ? eachDayOfInterval({ start: monthStart, end: elapsedEnd }).filter((d) => d.getDay() !== 0 && !holidayDayKeys.has(dayKey(d))).length
    : 0;

  const todayQuantity = sumFinished(todayRecords);
  const actualToDateQuantity = sumFinished(monthToDateRecords);

  const dailyTargetQuantity = workingDaysInMonth > 0 ? monthlyPlanQuantity / workingDaysInMonth : 0;
  const targetToDateQuantity = dailyTargetQuantity * workingDaysElapsed;
  const deficitQuantity = Math.round(targetToDateQuantity - actualToDateQuantity);

  return {
    monthlyPlanQuantity,
    workingDaysInMonth,
    dailyTargetQuantity: Math.round(dailyTargetQuantity),
    todayQuantity,
    deficitQuantity,
  };
}
