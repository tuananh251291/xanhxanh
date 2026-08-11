import { startOfWeek, endOfWeek, subWeeks, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays, format } from "date-fns";
import { vi } from "date-fns/locale";

export interface WeekBucket {
  start: Date;
  end: Date;
  label: string;
}

// Tạo danh sách "tuần" (thứ 2 - CN) từ weeksBack tuần trước tới tuần hiện tại, cũ → mới.
export function getWeekBuckets(weeksBack: number): WeekBucket[] {
  const now = new Date();
  return Array.from({ length: weeksBack }, (_, i) => {
    const start = startOfWeek(subWeeks(now, weeksBack - 1 - i), { weekStartsOn: 1 });
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return { start, end, label: format(start, "dd/MM", { locale: vi }) };
  });
}

export function bucketIndexForDate(buckets: WeekBucket[], date: Date): number {
  return buckets.findIndex((b) => date >= b.start && date <= b.end);
}

// Tạo danh sách "tháng" từ monthsBack tháng trước tới tháng hiện tại, cũ → mới — cùng dạng WeekBucket
// (start/end/label) để dùng chung được với bucketIndexForDate.
export function getMonthBuckets(monthsBack: number): WeekBucket[] {
  const now = new Date();
  return Array.from({ length: monthsBack }, (_, i) => {
    const start = startOfMonth(subMonths(now, monthsBack - 1 - i));
    const end = endOfMonth(start);
    return { start, end, label: format(start, "MM/yyyy", { locale: vi }) };
  });
}

export function isNearExpiry(expectedMoveAt: Date | null): boolean {
  if (!expectedMoveAt) return false;
  return differenceInCalendarDays(expectedMoveAt, new Date()) <= 3;
}
