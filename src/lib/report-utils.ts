import {
  startOfWeek, endOfWeek, subWeeks, addWeeks, startOfMonth, endOfMonth, subMonths, addMonths,
  differenceInCalendarDays, differenceInCalendarWeeks, differenceInCalendarMonths, format,
} from "date-fns";
import { vi } from "date-fns/locale";

// Chặn trên số kỳ tối đa trả về khi NV tự nhập quãng thời gian (tránh nhập quãng quá rộng làm truy vấn
// nặng/biểu đồ rối) — VD 60 tuần (~14 tháng) hoặc 60 tháng (5 năm), đủ rộng cho nhu cầu thực tế.
const MAX_RANGE_BUCKETS = 60;

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

// NV tự nhập quãng thời gian cần xem (from → to, ngày bất kỳ) — LUÔN làm tròn về "chẵn tuần" (Thứ 2 -
// CN chứa ngày đó) ở cả 2 đầu, để không có tuần nào bị cắt nửa chừng. `from` được làm tròn XUỐNG đầu
// tuần chứa nó, `to` làm tròn LÊN cuối tuần chứa nó (qua việc lấy startOfWeek rồi sinh đủ số tuần).
export function getWeekBucketsInRange(from: Date, to: Date): WeekBucket[] {
  const startBucket = startOfWeek(from, { weekStartsOn: 1 });
  const endBucket = startOfWeek(to, { weekStartsOn: 1 });
  const count = Math.min(MAX_RANGE_BUCKETS, Math.max(1, differenceInCalendarWeeks(endBucket, startBucket, { weekStartsOn: 1 }) + 1));
  return Array.from({ length: count }, (_, i) => {
    const start = addWeeks(startBucket, i);
    const end = endOfWeek(start, { weekStartsOn: 1 });
    return { start, end, label: format(start, "dd/MM", { locale: vi }) };
  });
}

// Tương tự getWeekBucketsInRange nhưng làm tròn về "chẵn tháng" (mùng 1 - cuối tháng chứa ngày đó).
export function getMonthBucketsInRange(from: Date, to: Date): WeekBucket[] {
  const startBucket = startOfMonth(from);
  const endBucket = startOfMonth(to);
  const count = Math.min(MAX_RANGE_BUCKETS, Math.max(1, differenceInCalendarMonths(endBucket, startBucket) + 1));
  return Array.from({ length: count }, (_, i) => {
    const start = addMonths(startBucket, i);
    const end = endOfMonth(start);
    return { start, end, label: format(start, "MM/yyyy", { locale: vi }) };
  });
}

export function isNearExpiry(expectedMoveAt: Date | null): boolean {
  if (!expectedMoveAt) return false;
  return differenceInCalendarDays(expectedMoveAt, new Date()) <= 3;
}
