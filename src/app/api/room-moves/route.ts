import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { upsertLot } from "@/lib/goods-receipt";
import { generateRoomMoveCode } from "@/lib/codes";
import { InsufficientRoomStockError } from "@/lib/finished-goods";
import { getRoomMoveRooms, getMovableLots, summarizeMovable } from "@/lib/room-move";
import { z } from "zod";

const schema = z.object({
  direction: z.enum(["TO_PROCESSING", "TO_STANDARD"]),
  lines: z
    .array(z.object({ plantTypeId: z.string().min(1), stageCode: z.string().min(1), quantity: z.number().int().positive() }))
    .min(1, "Chưa có dòng nào"),
  notes: z.string().trim().max(500).optional(),
});

// "Luân chuyển nội bộ" — Quản lý kho thành phẩm chuyển cây qua lại giữa Phòng đạt tiêu chuẩn và Phòng chờ xử
// lý của kho đang làm việc, nhiều mã cây/quy cách 1 lần. Tồn đổi NGAY trong 1 transaction: trừ FIFO ở phòng
// nguồn (chỉ phần còn chuyển được — xem getMovableLots: không rút phần đơn HELD/CONFIRMED đang giữ ở Phòng
// đạt tiêu chuẩn, không rút phần Phiếu xử lý chưa bàn giao đang giữ ở Phòng chờ xử lý), cộng dồn vào lô
// ACTIVE cùng mã cây + quy cách ở phòng đích. Lưu RoomMove để tra lịch sử.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "QUAN_LY_KHO_THANH_PHAM") {
    return NextResponse.json({ message: "Chỉ Quản lý kho thành phẩm mới luân chuyển được" }, { status: 403 });
  }
  const warehouseId = session.user.workplaceWarehouseId;
  if (!warehouseId) return NextResponse.json({ message: "Bạn chưa được gán kho làm việc" }, { status: 400 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { direction, lines, notes } = parsed.data;

  const { standardRoom, processingRoom } = await getRoomMoveRooms(warehouseId);
  if (!standardRoom || !processingRoom) {
    return NextResponse.json({ message: "Kho chưa có đủ Phòng đạt tiêu chuẩn và Phòng chờ xử lý — liên hệ Admin" }, { status: 400 });
  }
  const fromRoom = direction === "TO_PROCESSING" ? standardRoom : processingRoom;
  const toRoom = direction === "TO_PROCESSING" ? processingRoom : standardRoom;

  // Gộp các dòng trùng mã cây + quy cách.
  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(`${l.plantTypeId}:${l.stageCode}`, (wanted.get(`${l.plantTypeId}:${l.stageCode}`) ?? 0) + l.quantity);

  const plantTypes = await prisma.plantType.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.plantTypeId))] } },
    select: { id: true, code: true },
  });
  const ptById = new Map(plantTypes.map((p) => [p.id, p]));
  if (lines.some((l) => !ptById.has(l.plantTypeId))) return NextResponse.json({ message: "Mã cây không hợp lệ" }, { status: 400 });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { code: true } });
  const staffCode = me?.code ?? "000";

  try {
    const move = await prisma.$transaction(async (tx) => {
      // Đọc lại trong transaction — không tin số client đã xem.
      const movable = await getMovableLots(fromRoom.id, fromRoom.id === standardRoom.id, tx);
      const availableByKey = summarizeMovable(movable);
      for (const [key, qty] of wanted) {
        const [plantTypeId, stageCode] = key.split(":");
        const available = availableByKey.get(key) ?? 0;
        if (available < qty) {
          throw new InsufficientRoomStockError(
            `${ptById.get(plantTypeId)!.code} ${stageCode}: ${fromRoom.name} chỉ còn ${available.toLocaleString("vi-VN")} cây chuyển được (cần ${qty.toLocaleString("vi-VN")})`
          );
        }
      }

      for (const [key, qty] of wanted) {
        const [plantTypeId, stageCode] = key.split(":");
        let remaining = qty;
        for (const lot of movable) {
          if (remaining <= 0) break;
          if (lot.plantTypeId !== plantTypeId || lot.stageCode !== stageCode) continue;
          const take = Math.min(lot.available, remaining);
          await tx.lot.update({ where: { id: lot.id }, data: { quantity: { decrement: take } } });
          remaining -= take;
        }
        await upsertLot(tx, toRoom.id, plantTypeId, ptById.get(plantTypeId)!.code, stageCode, qty, staffCode);
      }

      return tx.roomMove.create({
        data: {
          code: await generateRoomMoveCode(tx),
          warehouseId,
          fromRoomId: fromRoom.id,
          toRoomId: toRoom.id,
          notes,
          createdById: session.user.id,
          items: {
            create: [...wanted].map(([key, quantity]) => {
              const [plantTypeId, stageCode] = key.split(":");
              return { plantTypeId, stageCode, quantity };
            }),
          },
        },
        select: { code: true },
      });
    }, { timeout: 30000 });
    return NextResponse.json({ success: true, code: move.code, count: wanted.size }, { status: 201 });
  } catch (err) {
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: err.message }, { status: 409 });
    throw err;
  }
}
