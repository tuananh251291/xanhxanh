import type { UserRole } from "@prisma/client";
import { isAdminRole } from "@/types";

// Chỉ Quản lý kho thành phẩm (và Admin) được chọn giờ "Thời gian dự kiến xuất" khác 9:00 — xem
// ShipAtInput (src/components/shared/ship-at-input.tsx).
export function canEditShipTime(role: UserRole | null | undefined): boolean {
  return role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role);
}

// Chuẩn hoá chuỗi client gửi ("yyyy-MM-ddTHH:mm" hoặc ISO) thành Date — vai trò không được sửa giờ thì ép
// về 9:00 cùng ngày (giờ địa phương server, VPS chạy múi +07). null = không hợp lệ.
export function normalizeExpectedShipAt(raw: string, role: UserRole | null | undefined): Date | null {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (canEditShipTime(role)) return parsed;
  const datePart = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0];
  const atNine = datePart ? new Date(`${datePart}T09:00`) : new Date(parsed.setHours(9, 0, 0, 0));
  return Number.isNaN(atNine.getTime()) ? null : atNine;
}
