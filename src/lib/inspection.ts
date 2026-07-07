import { getISODay, addDays } from "date-fns";

// Hạn kiểm tra nhiễm phòng tối cá nhân — mặc định 7 ngày kể từ lúc lô vào phòng tối, riêng lô vào
// Chủ nhật (ISO 7) tính 8 ngày.
export function getInspectionDueAt(enteredAt: Date): Date {
  const requiredDays = getISODay(enteredAt) === 7 ? 8 : 7;
  return addDays(enteredAt, requiredDays);
}
