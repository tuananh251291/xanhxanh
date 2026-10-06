import { addMonths, parse, isValid } from "date-fns";

// "Kỳ lương" dùng CHUNG cho toàn bộ tính năng lương NV cấy mô — THÁNG LỊCH (mùng 1 → hết ngày cuối
// tháng). Trước 06/10/2026 kỳ chạy mùng 7 → mùng 6 tháng sau để bù 7 ngày phòng tối; nay sản lượng đã tính
// theo NGÀY CẤY của lô (Lot.darkRoomEnteredAt, xem payroll-calculation.ts) nên dùng thẳng tháng lịch.
export const PAYROLL_PERIOD_START_DAY = 1;

export type PayrollPeriod = {
  periodMonth: string; // "yyyy-MM" — nhãn của kỳ (= tháng lịch)
  rangeStart: Date;
  rangeEnd: Date; // biên trên LOẠI TRỪ (exclusive) — dùng { gte: rangeStart, lt: rangeEnd }
};

function buildPeriod(anchorMonth: Date): PayrollPeriod {
  const rangeStart = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), PAYROLL_PERIOD_START_DAY, 0, 0, 0, 0);
  const rangeEnd = addMonths(rangeStart, 1);
  const periodMonth = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}`;
  return { periodMonth, rangeStart, rangeEnd };
}

// Kỳ lương CHỨA đúng thời điểm `date` — dùng khi cần biết "1 mốc thời gian bất kỳ (VD lúc ghi nhận vi
// phạm) rơi vào kỳ nào".
export function resolvePayrollPeriodForDate(date: Date): PayrollPeriod {
  const anchorMonth = date.getDate() < PAYROLL_PERIOD_START_DAY ? addMonths(date, -1) : date;
  return buildPeriod(anchorMonth);
}

// monthParam "yyyy-MM" tuỳ chọn — không truyền thì dùng kỳ HIỆN TẠI theo hôm nay (qua
// resolvePayrollPeriodForDate). Có truyền thì lấy THẲNG theo nhãn tháng chọn (VD "2026-10" → 01/10 → 31/10/2026).
export function resolvePayrollPeriod(monthParam?: string | null): PayrollPeriod {
  if (!monthParam) return resolvePayrollPeriodForDate(new Date());
  const parsedMonth = parse(monthParam, "yyyy-MM", new Date());
  const monthDate = isValid(parsedMonth) ? parsedMonth : new Date();
  return buildPeriod(monthDate);
}
