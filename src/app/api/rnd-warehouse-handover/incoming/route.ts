import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { RND_OUTPUT_TRANSFER_TAG, isKhoThanhPhamRole } from "@/types";

// Phiếu bàn giao R&D đang chờ + danh sách vị trí đích khả dụng để chọn lúc xác nhận — giàn kệ (Kho mô,
// kho đích là khu sản xuất) hoặc phòng (Kho thành phẩm, không quản lý theo giàn kệ) tuỳ đúng vai trò
// đang xem, xem confirmRndOutputReceipt (src/lib/rnd-warehouse-handover.ts).
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KHO_MO" && !isKhoThanhPhamRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const workplaceWarehouseId = session!.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) return NextResponse.json({ rows: [], shelves: [], rooms: [] });

  const [transfers, shelves, rooms] = await Promise.all([
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
    role === "KHO_MO"
      ? prisma.shelf.findMany({
          where: { warehouseId: workplaceWarehouseId, isActive: true, room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } } },
          select: {
            code: true, name: true, capacity: true, allowedCodes: true,
            room: { select: { type: true } },
            plantType: { select: { code: true } },
            assignedStaff: { select: { name: true } },
            lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
          },
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
    isKhoThanhPhamRole(role)
      ? prisma.room.findMany({
          where: { warehouseId: workplaceWarehouseId, isActive: true, type: { in: ["PHONG_DAT_TIEU_CHUAN", "PHONG_THEO_DOI", "PHONG_HAN_TUI"] } },
          select: { code: true, name: true, type: true },
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
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
    rooms: rooms.map((r) => ({ code: r.code, name: r.name, type: r.type })),
  });
}
