import { matchesAllowedCodes } from "@/lib/shelf-assignment";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import type { RoomType, UserRole } from "@prisma/client";

export const STOCK_IN_ROOM_TYPE: Record<"MAU_ME" | "THANH_PHAM", RoomType> = {
  MAU_ME: "PHONG_MAU_ME",
  THANH_PHAM: "PHONG_RA_RE",
};

// Kệ có được phép xếp mã cây này không — giống hệt cách planShelfAssignments xét kệ khi bàn giao tự
// động (src/lib/shelf-assignment.ts): Phòng ra rễ không ràng buộc mã cây, chỉ Phòng mẫu mẹ mới có 2 kiểu
// kệ — "đã chia" (plantTypeId khớp ĐÚNG mã cây, không xét allowedCodes) hoặc "chung" (allowedCodes rỗng
// = nhận mọi mã, có giá trị = phải khớp tiền tố).
export function shelfMatchesPlantType(
  stage: "MAU_ME" | "THANH_PHAM",
  shelf: { plantTypeId: string | null; allowedCodes: string[] },
  plantTypeId: string,
  plantTypeCode: string
): boolean {
  if (stage === "THANH_PHAM") return true;
  if (shelf.plantTypeId) return shelf.plantTypeId === plantTypeId;
  return shelf.allowedCodes.length === 0 || matchesAllowedCodes(shelf.allowedCodes, plantTypeCode);
}

// Ai được dùng tính năng Nhập kho thủ công và kho nào áp dụng — KHO_MO chỉ được thao tác đúng kho làm
// việc của mình (workplaceWarehouseId, KHÔNG cho tự chọn kho khác dù có truyền lên); Admin/Admin cấp cao
// được thao tác MỌI kho sản xuất nhưng phải tự chọn (không có kho mặc định) — validate lại đúng
// warehouseId đó tồn tại, còn hoạt động và đúng loại SAN_XUAT (không cho nhập nhầm vào kho thành phẩm).
export async function resolveStockInWarehouseId(
  role: UserRole | null | undefined,
  workplaceWarehouseId: string | null | undefined,
  requestedWarehouseId: string | null
): Promise<{ warehouseId: string } | { error: string }> {
  if (role === "KHO_MO") {
    if (!workplaceWarehouseId) return { error: "Bạn chưa được gán kho làm việc — liên hệ Admin cấp cao" };
    return { warehouseId: workplaceWarehouseId };
  }
  if (!isAdminRole(role)) return { error: "Bạn không có quyền dùng chức năng này" };
  if (!requestedWarehouseId) return { error: "Cần chọn kho sản xuất" };
  const warehouse = await prisma.warehouse.findUnique({
    where: { id: requestedWarehouseId },
    select: { type: true, isActive: true },
  });
  if (!warehouse || warehouse.type !== "SAN_XUAT" || !warehouse.isActive) {
    return { error: "Kho sản xuất không hợp lệ" };
  }
  return { warehouseId: requestedWarehouseId };
}
