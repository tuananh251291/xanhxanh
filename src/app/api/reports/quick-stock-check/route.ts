import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";
import type { RoomType } from "@prisma/client";

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

  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      plantTypeId,
      stageCode,
      shelf: { room: { warehouseId } },
    },
    select: { quantity: true, shelf: { select: { room: { select: { type: true } } } } },
  });

  const byRoomType: Partial<Record<RoomType, number>> = {};
  let total = 0;
  for (const lot of lots) {
    const type = lot.shelf?.room?.type;
    total += lot.quantity;
    if (type) byRoomType[type] = (byRoomType[type] ?? 0) + lot.quantity;
  }

  return NextResponse.json({ total, byRoomType });
}
