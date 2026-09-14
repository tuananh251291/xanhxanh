import { prisma } from "@/lib/prisma";
import type { CapacityScope } from "@/lib/production-capacity";

// "Số lượng hiện có" đúng nghĩa — KHÁC "vốn dự báo" ở getRotationGroupsWithStock (production-capacity.ts,
// CHỈ tính phần đã xếp giàn VÀ đã gán Nhóm tuần xoay vòng, vì đó là điều kiện BẮT BUỘC để mô phỏng lịch cấy
// chuyển — bỏ sót có chủ đích phần chưa xác định được lịch xoay vòng). Số hiện có = TOÀN BỘ hàng đang thực
// sự nằm trong tay đơn vị (không phân biệt đã gán Nhóm xoay vòng hay chưa):
//   Kho sáng (đã xếp giàn, đúng phòng theo stage — Phòng mẫu mẹ cho MAU_ME/Phòng ra rễ cho THANH_PHAM)
// + Phòng tối cá nhân từng NV, CHƯA có phiếu bàn giao nào (transferItems rỗng — đã bàn giao thì không còn
//   là "hàng của NV giữ", dù Kho mô chưa xác nhận xong)
// KHÔNG cộng lô đang ở Phòng nhiễm (tự động bị loại vì không khớp 2 điều kiện trên) — đúng "đã trừ hàng
// nhiễm" vì Lot.quantity của lô Phòng nhiễm không thuộc kho sáng lẫn phòng tối "khả dụng".
// Phát hiện qua trao đổi thực tế 14/09/2026 (mã MS001: 2.180 cụm đã xếp giàn nhưng còn 3.375 cụm nằm ở
// Phòng tối cá nhân, chưa bàn giao — không được tính vào "vốn dự báo" nhưng vẫn là hàng CÓ THẬT).
export type CurrentStockBreakdown = {
  shelvedQuantity: number; // kho sáng
  darkRoomQuantity: number; // phòng tối cá nhân, chưa bàn giao
  totalQuantity: number;
};

export async function computeCurrentStock(
  plantTypeId: string,
  stage: "MAU_ME" | "THANH_PHAM",
  scope: CapacityScope
): Promise<CurrentStockBreakdown> {
  const roomType = stage === "MAU_ME" ? "PHONG_MAU_ME" : "PHONG_RA_RE";

  const [shelvedAgg, darkRoomLots] = await Promise.all([
    prisma.lot.aggregate({
      where: {
        status: "ACTIVE",
        stage,
        plantTypeId,
        shelfId: { not: null },
        shelf: {
          room: { type: roomType },
          ...(scope.kind === "WAREHOUSE" ? { warehouseId: scope.warehouseId } : {}),
          ...(scope.kind === "STAFF" ? { assignedStaffId: scope.staffId } : {}),
        },
      },
      _sum: { quantity: true },
    }),
    prisma.lot.findMany({
      where: {
        status: "ACTIVE",
        stage,
        plantTypeId,
        shelfId: null,
        room: {
          type: "PHONG_TOI",
          ...(scope.kind === "WAREHOUSE" ? { warehouseId: scope.warehouseId } : {}),
          ...(scope.kind === "STAFF" ? { assignedStaffId: scope.staffId } : {}),
        },
        transferItems: { none: {} },
      },
      select: { quantity: true },
    }),
  ]);

  const shelvedQuantity = shelvedAgg._sum.quantity ?? 0;
  const darkRoomQuantity = darkRoomLots.reduce((s, l) => s + l.quantity, 0);
  return { shelvedQuantity, darkRoomQuantity, totalQuantity: shelvedQuantity + darkRoomQuantity };
}
