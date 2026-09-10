import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { RND_OUTPUT_TRANSFER_TAG } from "@/types";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ rows: [], shelves: [] });

  const [transfers, shelves] = await Promise.all([
    prisma.transfer.findMany({
      where: { notes: { startsWith: RND_OUTPUT_TRANSFER_TAG }, toWarehouseId: workplaceWarehouseId, status: "PENDING" },
      include: {
        fromUser: { select: { code: true, name: true } },
        items: {
          select: {
            quantity: true,
            lot: { select: { stage: true, stageCode: true, plantType: { select: { code: true, name: true } } } },
          },
        },
      },
      orderBy: { transferredAt: "asc" },
    }),
    // Giàn đích khả dụng cho Kho mô chọn lúc xác nhận — CẢ Phòng mẫu mẹ (nhận mẫu mẹ R&D) lẫn Phòng ra rễ
    // (nhận thành phẩm R&D), client tự lọc theo đúng roomType khớp stage của từng phiếu.
    prisma.shelf.findMany({
      where: { warehouseId: workplaceWarehouseId, isActive: true, room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } } },
      select: {
        code: true, name: true, capacity: true, allowedCodes: true,
        room: { select: { type: true } },
        plantType: { select: { code: true } },
        assignedStaff: { select: { name: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
      orderBy: { code: "asc" },
    }),
  ]);

  return NextResponse.json({
    rows: transfers.map((t) => ({
      transferId: t.id,
      code: t.code,
      transferredAt: t.transferredAt,
      fromUserCode: t.fromUser.code,
      fromUserName: t.fromUser.name,
      stage: t.items[0]?.lot.stage ?? null,
      items: t.items.map((i) => ({
        plantTypeCode: i.lot.plantType.code,
        plantTypeName: i.lot.plantType.name,
        stageCode: i.lot.stageCode,
        quantity: i.quantity,
      })),
      totalQuantity: t.items.reduce((s, i) => s + i.quantity, 0),
    })),
    shelves: shelves.map((s) => ({
      code: s.code,
      name: s.name,
      roomType: s.room?.type ?? null,
      capacity: s.capacity,
      used: s.lots.reduce((sum, l) => sum + l.quantity, 0),
      plantTypeCode: s.plantType?.code ?? null,
      assignedStaffName: s.assignedStaff?.name ?? null,
      allowedCodes: s.allowedCodes,
    })),
  });
}
