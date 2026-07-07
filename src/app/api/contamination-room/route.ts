import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Tồn hiện có trong Phòng nhiễm của 1 kho sản xuất — dùng để đổ dropdown mã cây/quy cách và validate
// số lượng đề xuất Trồng/Hủy (xem POST /api/contamination-proposals).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId") ?? session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json([]);

  const room = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
  if (!room) return NextResponse.json([]);

  const lots = await prisma.lot.findMany({
    where: { roomId: room.id, status: "ACTIVE", quantity: { gt: 0 } },
    include: { plantType: { select: { id: true, code: true, name: true } } },
    orderBy: [{ plantType: { code: "asc" } }, { stageCode: "asc" }],
  });

  return NextResponse.json(
    lots.map((l) => ({
      plantTypeId: l.plantTypeId,
      plantTypeCode: l.plantType.code,
      plantTypeName: l.plantType.name,
      stageCode: l.stageCode,
      quantity: l.quantity,
    }))
  );
}
