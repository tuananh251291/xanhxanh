import { prisma } from "@/lib/prisma";
import { eachDayOfInterval, format } from "date-fns";

// KPI/ngày của NV cấy mô TỰ TÍNH (không còn nhập tay ở tab "KPI của nhân viên") theo quy định (05/10/2026):
//   KPI/ngày = (Lương công việc + Mức KPI tuân thủ tối đa + Mức KPI công việc tối đa) × 12 tháng
//              ÷ (365 ngày − số Chủ nhật trong năm − số ngày nghỉ lễ − 12 ngày phép)
// Cả 3 khoản đều là mức THEO THÁNG đang cài cho NV (StaffBaseSalary.monthlyAmount / kpiBonusAmount (nếu
// chưa cài riêng thì mức chung KpiBonusRate) / workKpiMaxAmount). Dùng MỨC TỐI ĐA chứ không dùng số thực
// nhận để tránh vòng lặp (KPI công việc của NV chính thức = sản lượng thực tế ÷ sản lượng chỉ tiêu, mà
// sản lượng chỉ tiêu lại = KPI/ngày × ngày công tính KPI). Năm = năm của kỳ lương.
export const ANNUAL_LEAVE_DAYS = 12;
export const DAYS_PER_YEAR = 365;

export type AnnualWorkDays = {
  year: number;
  daysInYear: number;
  sundays: number;
  // Ngày nghỉ lễ (bảng "Ngày nghỉ lễ") trong năm KHÔNG rơi vào Chủ nhật — ngày lễ trùng Chủ nhật đã nằm
  // trong số Chủ nhật, không trừ 2 lần.
  holidays: number;
  leaveDays: number;
  workDays: number;
};

export async function computeAnnualWorkDays(year: number): Promise<AnnualWorkDays> {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const sundays = eachDayOfInterval({ start, end }).filter((d) => d.getDay() === 0).length;
  const holidayRows = await prisma.publicHoliday.findMany({ where: { date: { gte: start, lt: new Date(year + 1, 0, 1) } }, select: { date: true } });
  const holidayKeys = new Set(holidayRows.filter((h) => h.date.getDay() !== 0).map((h) => format(h.date, "yyyy-MM-dd")));
  const workDays = DAYS_PER_YEAR - sundays - holidayKeys.size - ANNUAL_LEAVE_DAYS;
  return { year, daysInYear: DAYS_PER_YEAR, sundays, holidays: holidayKeys.size, leaveDays: ANNUAL_LEAVE_DAYS, workDays };
}

// null khi NV chưa cài khoản nào (tổng = 0) hoặc số ngày làm việc không hợp lệ — khi đó KHÔNG có sản lượng
// chỉ tiêu, không tính Thưởng vượt sản lượng/KPI công việc theo sản lượng (tránh coi chỉ tiêu = 0đ).
export function computeKpiDailyRate(
  monthlySalary: number | null,
  complianceKpiMax: number | null,
  workKpiMax: number | null,
  annualWorkDays: number
): number | null {
  const monthlyTotal = (monthlySalary ?? 0) + (complianceKpiMax ?? 0) + (workKpiMax ?? 0);
  if (monthlyTotal <= 0 || annualWorkDays <= 0) return null;
  return Math.round((monthlyTotal * 12) / annualWorkDays);
}
