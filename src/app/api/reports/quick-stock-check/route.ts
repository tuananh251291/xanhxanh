import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";
import type { RoomType } from "@prisma/client";

// Quy cách "Cây thành phẩm" (chọn ở FE) = tổng cả 3 quy cách túi thành phẩm cộng lại, không phải 1 quy
// cách cụ thể — xem FINISHED_STAGE_CODES ở production-quick-check.tsx (giữ đúng 1 nguồn duy nhất
// STAGE_OPTIONS phía đó, ở đây chỉ nhận lại và tách ra khi cần).
const ALL_FINISHED_STAGE_CODES = ["T01", "T05", "T10"];

// "Kiểm tra nhanh sản lượng" ở tab Sản lượng (/reports) — số lượng ACTIVE của 1 (kho sản xuất, mã cây,
// quy cách) tại thời điểm gọi, cộng gộp CẢ khu sản xuất (Phòng tối cá nhân của từng NV cấy — hàng chưa
// bàn giao, Phòng mẫu mẹ, Phòng ra rễ — 2 phòng sau là "kho sáng"), không giới hạn theo NV/phòng cụ thể
// nào. Lot.quantity đã tự trừ hàng nhiễm ngay lúc kiểm tra (xem PATCH /api/lot-inspections — trừ thẳng
// contaminatedQuantity khỏi quantity), nên chỉ cần status: ACTIVE là đã loại hàng nhiễm, không cần thêm
// điều kiện gì khác. warehouseId = "ALL" (chọn từ FE) nghĩa là không lọc theo kho — gộp toàn bộ, kèm
// breakdown byWarehouse. plantTypeIds (danh sách id nối dấu phẩy, bỏ trống = mọi loại — FE cho tích chọn
// nhiều loại cây, xem PlantTypeMultiFilter) — breakdown byPlantType hiện khi số loại KHÁC ĐÚNG 1 (0 =
// tất cả, 2+ = nhiều loại tường minh), cùng quy ước với instruction-plan-vs-actual/route.ts.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/reports"))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const plantTypeIds = Array.from(
    new Set((searchParams.get("plantTypeIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  );
  const stageCode = searchParams.get("stageCode");
  if (!warehouseId || !stageCode) {
    return NextResponse.json({ message: "Thiếu khu sản xuất/quy cách" }, { status: 400 });
  }
  const isAllFinished = stageCode === "ALL_FINISHED";
  const isAllWarehouses = warehouseId === "ALL";
  const needsPlantTypeBreakdown = plantTypeIds.length !== 1;

  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      plantTypeId: plantTypeIds.length > 0 ? { in: plantTypeIds } : undefined,
      stageCode: isAllFinished ? { in: ALL_FINISHED_STAGE_CODES } : stageCode,
      shelf: { room: { warehouseId: isAllWarehouses ? undefined : warehouseId } },
    },
    select: {
      quantity: true,
      stageCode: true,
      shelf: { select: { room: { select: { type: true, warehouse: { select: { code: true, name: true } } } } } },
      plantType: { select: { code: true, name: true } },
    },
  });

  const byRoomType: Partial<Record<RoomType, number>> = {};
  const byStageCode: Record<string, number> = {};
  const byWarehouse: Record<string, number> = {};
  const byPlantType: Record<string, number> = {};
  let total = 0;
  for (const lot of lots) {
    const type = lot.shelf?.room?.type;
    total += lot.quantity;
    if (type) byRoomType[type] = (byRoomType[type] ?? 0) + lot.quantity;
    if (isAllFinished) byStageCode[lot.stageCode] = (byStageCode[lot.stageCode] ?? 0) + lot.quantity;
    if (isAllWarehouses) {
      const w = lot.shelf?.room?.warehouse;
      const label = w ? `${w.code} — ${w.name}` : "Khác";
      byWarehouse[label] = (byWarehouse[label] ?? 0) + lot.quantity;
    }
    if (needsPlantTypeBreakdown) {
      const label = `${lot.plantType.code} — ${lot.plantType.name}`;
      byPlantType[label] = (byPlantType[label] ?? 0) + lot.quantity;
    }
  }

  return NextResponse.json({
    total,
    byRoomType,
    ...(isAllFinished ? { byStageCode } : {}),
    ...(isAllWarehouses ? { byWarehouse } : {}),
    ...(needsPlantTypeBreakdown ? { byPlantType } : {}),
  });
}
