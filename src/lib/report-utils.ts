import { startOfWeek, endOfWeek, subWeeks, differenceInCalendarDays, format } from "date-fns";
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

export function isNearExpiry(expectedMoveAt: Date | null): boolean {
  if (!expectedMoveAt) return false;
  return differenceInCalendarDays(expectedMoveAt, new Date()) <= 3;
}
