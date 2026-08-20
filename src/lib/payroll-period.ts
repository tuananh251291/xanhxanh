import { addMonths, parse, isValid } from "date-fns";

// "Kỳ lương" dùng CHUNG cho toàn bộ tính năng lương NV cấy mô — mùng 7 tháng X đến TRƯỚC mùng 7 tháng
// X+1 (không phải tháng lịch), khớp đúng quy ước đã dùng ở /api/transfers/my-handovers và
// /api/reports/handover-summary (không đổi 2 route đó, chỉ dùng chung công thức này cho code payroll
// mới thêm sau này).
export const PAYROLL_PERIOD_START_DAY = 7;

export type PayrollPeriod = {
  periodMonth: string; // "yyyy-MM" — nhãn của kỳ (tháng chứa mùng 7 mở đầu kỳ)
  rangeStart: Date;
  rangeEnd: Date; // biên trên LOẠI TRỪ (exclusive) — dùng { gte: rangeStart, lt: rangeEnd }
};

function buildPeriod(anchorMonth: Date): PayrollPeriod {
  const rangeStart = new Date(anchorMonth.getFullYear(), anchorMonth.getMonth(), PAYROLL_PERIOD_START_DAY, 0, 0, 0, 0);
  const rangeEnd = addMonths(rangeStart, 1);
  const periodMonth = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}`;
  return { periodMonth, rangeStart, rangeEnd };
}

// Kỳ lương CHỨA đúng thời điểm `date` — hôm/giờ đó thuộc kỳ bắt đầu mùng 7 tháng nào. Dùng khi cần biết
// "1 mốc thời gian bất kỳ (VD lúc ghi nhận vi phạm) rơi vào kỳ nào" — LUÔN nhạy theo ngày-trong-tháng
// (khác resolvePayrollPeriod khi có truyền monthParam tường minh — lúc đó lấy thẳng theo nhãn tháng
// chọn, không cần suy theo ngày).
export function resolvePayrollPeriodForDate(date: Date): PayrollPeriod {
  const anchorMonth = date.getDate() < PAYROLL_PERIOD_START_DAY ? addMonths(date, -1) : date;
  return buildPeriod(anchorMonth);
}

// monthParam "yyyy-MM" tuỳ chọn — không truyền thì dùng kỳ HIỆN TẠI theo hôm nay (qua
// resolvePayrollPeriodForDate, tự lùi về tháng trước nếu chưa tới mùng 7). Có truyền thì lấy THẲNG theo
// nhãn tháng chọn (không suy theo ngày trong tháng — chọn "2026-08" luôn là kỳ 07/08 → 06/09/2026).
export function resolvePayrollPeriod(monthParam?: string | null): PayrollPeriod {
  if (!monthParam) return resolvePayrollPeriodForDate(new Date());
  const parsedMonth = parse(monthParam, "yyyy-MM", new Date());
  const monthDate = isValid(parsedMonth) ? parsedMonth : new Date();
  return buildPeriod(monthDate);
}
