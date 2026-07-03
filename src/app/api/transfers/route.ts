import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateTransferCode } from "@/lib/codes";
import { z } from "zod";

const createSchema = z
  .object({
    toWarehouseId: z.string().optional(),
    toRoomId: z.string().optional(),
    toUserId: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(z.object({
      lotId: z.string(),
      quantity: z.number().int().positive(),
      notes: z.string().optional(),
    })),
  })
  .refine((v) => v.toWarehouseId || v.toRoomId, {
    message: "Cần chọn kho hoặc phòng đích",
  });

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role === "CAY_MO") where.fromUserId = session.user.id;
  if (role === "KHO_MO" || role === "KHO_THANH_PHAM") {
    where.OR = [{ fromUserId: session.user.id }, { toUserId: session.user.id }];
  }

  const transfers = await prisma.transfer.findMany({
    where,
    include: {
      fromWarehouse: { select: { name: true, type: true } },
      fromRoom: { select: { name: true, type: true } },
      toWarehouse: { select: { name: true, type: true, shelves: { where: { isActive: true, roomId: null } } } },
      toRoom: { select: { name: true, type: true, shelves: { where: { isActive: true } } } },
      fromUser: { select: { name: true } },
      toUser: { select: { name: true } },
      items: {
        include: {
          lot: {
            select: { code: true, stage: true, quantity: true, plantType: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(transfers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { toRoomId, toUserId, notes, items } = parsed.data;
  let { toWarehouseId } = parsed.data;

  // Nếu chọn phòng đích (vd: phòng tối), suy ra kho chứa phòng đó
  if (toRoomId) {
    const toRoom = await prisma.room.findUnique({ where: { id: toRoomId } });
    if (!toRoom) return NextResponse.json({ message: "Không tìm thấy phòng đích" }, { status: 400 });
    toWarehouseId = toRoom.warehouseId;
  }
  if (!toWarehouseId) {
    return NextResponse.json({ message: "Cần chọn kho hoặc phòng đích" }, { status: 400 });
  }

  // Lấy warehouse/room nguồn từ lot đầu tiên
  const firstLot = await prisma.lot.findUnique({
    where: { id: items[0].lotId },
    include: { shelf: { include: { warehouse: true, room: true } } },
  });

  const code = await generateTransferCode();

  const transfer = await prisma.transfer.create({
    data: {
      code,
      fromWarehouseId: firstLot?.shelf?.warehouseId ?? null,
      fromRoomId: firstLot?.shelf?.roomId ?? null,
      toWarehouseId,
      toRoomId,
      fromUserId: session.user.id,
      toUserId,
      notes,
      items: { create: items },
    },
    include: {
      items: { include: { lot: true } },
      toWarehouse: true,
      toRoom: true,
    },
  });

  return NextResponse.json(transfer, { status: 201 });
}
