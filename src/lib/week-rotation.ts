import { differenceInCalendarWeeks, startOfISOWeekYear, addWeeks } from "date-fns";

// Thứ 2 cố định làm mốc khi SUPER_ADMIN CHƯA cấu hình "Tuần khởi đầu của Nhóm 1" (xem
// ROOTING_ROTATION_START_WEEK_KEY ở src/lib/rooting-week-group.ts, MOTHER_ROTATION_START_WEEK_KEY ở
// src/lib/mother-week-group.ts) — chỉ dùng để tính số tuần liên tục trôi qua, không mang ý nghĩa nghiệp
// vụ gì, giữ nguyên hành vi cũ (tương thích ngược) cho tới khi có cấu hình thật.
const DEFAULT_EPOCH_MONDAY = new Date(2024, 0, 1);

// Quy đổi chuỗi tuần ISO 8601 "YYYY-Www" (định dạng input type="week") sang Thứ 2 của đúng tuần đó —
// dùng startOfISOWeekYear trên 1 ngày bất kỳ chắc chắn thuộc năm-tuần-ISO đó (4/1 luôn thuộc tuần 1 theo
// định nghĩa ISO 8601) rồi cộng thêm (isoWeek - 1) tuần. null nếu chuỗi không đúng định dạng.
export function isoWeekStringToMonday(value: string): Date | null {
  const match = value.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const isoYear = parseInt(match[1], 10);
  const isoWeek = parseInt(match[2], 10);
  if (isoWeek < 1 || isoWeek > 53) return null;
  const week1Monday = startOfISOWeekYear(new Date(isoYear, 0, 4));
  return addWeeks(week1Monday, isoWeek - 1);
}

// Khe nào (Thứ 2 - Chủ nhật) trong chu kỳ N tuần liên tục thì được coi là "hiện tại" — N = tổng số Nhóm
// xoay vòng cùng loại (rotationKind) đang được SUPER_ADMIN cấu hình tại /settings/shelf-groups (xem
// ShelfGroup.rotationOrder), dùng chung cho cả Nhóm tuần ra rễ (xem src/lib/shelf-assignment.ts) lẫn
// Nhóm tuần mẫu mẹ. Xoay vòng đều đặn theo tuần liên tục mod N tính từ epochMonday (mặc định
// DEFAULT_EPOCH_MONDAY nếu chưa cấu hình, hoặc Thứ 2 của tuần ISO SUPER_ADMIN đã chọn làm Nhóm 1 — xem
// isoWeekStringToMonday), không cần lưu "nhóm đang active" — tính lại y hệt mỗi lần gọi, ổn định qua các
// lần restart server, không lệch khi qua năm mới (kể cả năm có 53 tuần ISO, vì đếm tuần liên tục trên
// lịch chứ không dùng số thứ tự tuần của từng năm).
export function getCurrentWeekSlot(totalSlots: number, date: Date = new Date(), epochMonday: Date = DEFAULT_EPOCH_MONDAY): number {
  if (totalSlots <= 0) return 1;
  const weekIndex = differenceInCalendarWeeks(date, epochMonday, { weekStartsOn: 1 });
  return (((weekIndex % totalSlots) + totalSlots) % totalSlots) + 1;
}
