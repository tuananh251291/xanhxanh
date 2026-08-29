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
// điều kiện gì khác.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/reports"))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const plantTypeId = searchParams.get("plantTypeId");
  const stageCode = searchParams.get("stageCode");
  if (!warehouseId || !plantTypeId || !stageCode) {
    return NextResponse.json({ message: "Thiếu khu sản xuất/mã cây/quy cách" }, { status: 400 });
  }
  const isAllFinished = stageCode === "ALL_FINISHED";

  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      plantTypeId,
      stageCode: isAllFinished ? { in: ALL_FINISHED_STAGE_CODES } : stageCode,
      shelf: { room: { warehouseId } },
    },
    select: { quantity: true, stageCode: true, shelf: { select: { room: { select: { type: true } } } } },
  });

  const byRoomType: Partial<Record<RoomType, number>> = {};
  const byStageCode: Record<string, number> = {};
  let total = 0;
  for (const lot of lots) {
    const type = lot.shelf?.room?.type;
    total += lot.quantity;
    if (type) byRoomType[type] = (byRoomType[type] ?? 0) + lot.quantity;
    if (isAllFinished) byStageCode[lot.stageCode] = (byStageCode[lot.stageCode] ?? 0) + lot.quantity;
  }

  return NextResponse.json({ total, byRoomType, ...(isAllFinished ? { byStageCode } : {}) });
}
