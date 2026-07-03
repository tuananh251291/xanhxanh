import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

// toWarehouseId/toRoomId để trống khi bàn giao "phòng tối → kho sáng": đích cụ thể (Phòng mẫu mẹ hay
// Phòng ra rễ, kệ nào) do hệ thống tự chỉ định lúc KHO_MO xác nhận (xem PATCH /api/transfers/[id]),
// nên chỉ cần suy ra đúng kho (cùng kho sản xuất với nguồn) — không cần người tạo phiếu chọn tay.
const createSchema = z.object({
  toWarehouseId: z.string().optional(),
  toRoomId: z.string().optional(),
  toUserId: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    lotId: z.string(),
    quantity: z.number().int().positive(),
    notes: z.string().optional(),
  })).min(1, "Cần chọn ít nhất 1 lô"),
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
    // Bàn giao từ Phòng tối không chỉ định người nhận cụ thể — bất kỳ KHO_MO nào cũng nhận được,
    // nên cần hiện cho mọi KHO_MO chứ không chỉ người tạo/người được chỉ định.
    where.OR = [
      { fromUserId: session.user.id },
      { toUserId: session.user.id },
      { toUserId: null, fromRoom: { type: "PHONG_TOI" } },
    ];
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

  // Lấy warehouse/room nguồn từ lot đầu tiên
  const firstLot = await prisma.lot.findUnique({
    where: { id: items[0].lotId },
    include: {
      shelf: { include: { warehouse: true, room: true } },
      instruction: { include: { items: { take: 1, include: { shelf: { select: { warehouseId: true } } } } } },
    },
  });

  let fromWarehouseId = firstLot?.shelf?.warehouseId ?? null;
  let fromRoomId = firstLot?.shelf?.roomId ?? null;
  let isFromDarkRoom = firstLot?.shelf?.room?.type === "PHONG_TOI";

  // Lô chưa được xếp kệ nào (vừa cấy xong, đang "trong phòng tối" theo nghĩa khái niệm, chờ bàn giao) —
  // suy ra kho từ kệ nguồn của chỉ định cấy đã tạo ra lô, rồi lấy Phòng tối của đúng kho đó làm nguồn.
  if (!fromWarehouseId) {
    const instrWarehouseId = firstLot?.instruction?.items[0]?.shelf?.warehouseId;
    if (instrWarehouseId) {
      fromWarehouseId = instrWarehouseId;
      const darkRoom = await prisma.room.findFirst({ where: { warehouseId: instrWarehouseId, type: "PHONG_TOI" } });
      fromRoomId = darkRoom?.id ?? null;
      isFromDarkRoom = !!darkRoom;
    }
  }

  // Không chọn đích cụ thể (VD: gửi từ phòng tối, để hệ thống tự chỉ định kệ lúc xác nhận) → mặc định
  // cùng kho sản xuất với nguồn.
  if (!toWarehouseId) toWarehouseId = fromWarehouseId ?? undefined;
  if (!toWarehouseId) {
    return NextResponse.json({ message: "Cần chọn kho hoặc phòng đích" }, { status: 400 });
  }

  const code = await generateTransferCode();

  const transfer = await prisma.transfer.create({
    data: {
      code,
      fromWarehouseId,
      fromRoomId,
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

  // Bàn giao từ Phòng tối → thông báo cho KHO_MO có phiếu chờ nhận.
  if (isFromDarkRoom) {
    await createAlert({
      type: "LOT_READY_TRANSFER",
      title: "Có phiếu bàn giao từ phòng tối chờ nhận",
      message: `${session.user.name} đã gửi phiếu ${code} — ${items.length} lô từ phòng tối, chờ xác nhận nhập kho`,
      targetRole: "KHO_MO",
      relatedId: transfer.id,
      relatedType: "Transfer",
    });
  }

  return NextResponse.json(transfer, { status: 201 });
}
