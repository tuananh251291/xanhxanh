import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";

// Lịch sử từng lần cộng nhiễm vào 1 lô gộp ở Phòng nhiễm (Lot.code "NHIEM-{maKho}-{maCay}") — xem
// ContaminationRoomEntry/addToContaminationRoom. Dùng để trả lời "905 cụm này từ đâu ra" khi xem tổng số
// gộp ở trang /inventory/phong-toi/[warehouseId]/[roomId] (Phòng nhiễm).
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/phong-toi"))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const lotId = searchParams.get("lotId");
  if (!lotId) return NextResponse.json({ message: "Thiếu lotId" }, { status: 400 });

  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    select: { code: true, room: { select: { type: true, warehouseId: true } } },
  });
  if (!lot || lot.room?.type !== "PHONG_NHIEM") {
    return NextResponse.json({ message: "Không tìm thấy lô Phòng nhiễm" }, { status: 404 });
  }
  // NV kho mô chỉ xem được đúng 1 kho sản xuất đã được gán — NV kỹ thuật/Admin không giới hạn.
  if (role === "KHO_MO" && session?.user?.workplaceWarehouseId && lot.room.warehouseId !== session.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Không có quyền xem kho này" }, { status: 403 });
  }

  const entries = await prisma.contaminationRoomEntry.findMany({
    where: { contaminationLotId: lotId },
    include: { reportedBy: { select: { code: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(entries);
}
