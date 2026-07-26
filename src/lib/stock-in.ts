import { matchesAllowedCodes } from "@/lib/shelf-assignment";
import type { RoomType } from "@prisma/client";

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
