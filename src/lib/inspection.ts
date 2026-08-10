import { getISODay, addDays, startOfDay } from "date-fns";

// Hạn kiểm tra nhiễm phòng tối cá nhân — mặc định 7 NGÀY LỊCH kể từ ngày lô vào phòng tối (đủ ngày thứ
// 7 là kiểm tra được ngay từ 00:00, không cần đợi đủ 7×24 giờ tính từ đúng giờ nhập) — riêng lô vào Chủ
// nhật (ISO 7) tính 8 ngày. startOfDay lấy mốc nửa đêm theo giờ hệ thống (server chạy Asia/Saigon) nên
// khớp đúng ngày lịch Việt Nam.
export function getInspectionDueAt(enteredAt: Date): Date {
  const requiredDays = getISODay(enteredAt) === 7 ? 8 : 7;
  return startOfDay(addDays(enteredAt, requiredDays));
}
