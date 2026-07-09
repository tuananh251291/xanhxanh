import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SURPLUS_TRANSFER_TAG } from "@/types";

// Danh sách phiếu "Bàn giao MM dư" đang chờ — mẫu mẹ dư khi 1 chỉ định kết thúc do hết thời gian
// (xem POST /api/instructions/[id]/surplus-handover), gắn fromRoomId = Phòng tối nên KHÔNG phân biệt
// luồng Xanh/Đỏ (mọi Kho mô cùng kho đều thấy và xác nhận được). Xác nhận thật vẫn dùng chung
// PATCH /api/transfers/[id] (nhánh isSurplusTransfer đã tự xếp vào Kho quá hạn qua planSurplusPlacement).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json([]);

  const transfers = await prisma.transfer.findMany({
    where: {
      status: "PENDING",
      notes: SURPLUS_TRANSFER_TAG,
      fromRoom: { type: "PHONG_TOI", warehouseId: workplaceWarehouseId },
    },
    select: {
      id: true,
      code: true,
      transferredAt: true,
      fromUser: { select: { code: true, name: true } },
      items: {
        select: { quantity: true, lot: { select: { code: true, stageCode: true } } },
      },
    },
    orderBy: { transferredAt: "asc" },
  });

  const rows = transfers.map((t) => ({
    transferId: t.id,
    code: t.code,
    transferredAt: t.transferredAt,
    staffCode: t.fromUser.code,
    staffName: t.fromUser.name,
    items: t.items.map((i) => ({ lotCode: i.lot.code, stageCode: i.lot.stageCode, quantity: i.quantity })),
    totalQuantity: t.items.reduce((s, i) => s + i.quantity, 0),
  }));

  return NextResponse.json(rows);
}
