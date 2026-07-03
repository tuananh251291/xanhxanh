import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { motherClusterUnits } from "@/types";
import { z } from "zod";

const confirmSchema = z.object({
  action: z.enum(["confirm", "reject"]),
  shelfAssignments: z.array(z.object({ lotId: z.string(), shelfId: z.string() })).optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: { items: { include: { lot: true } } },
  });
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (transfer.status !== "PENDING") return NextResponse.json({ message: "Phiếu đã xử lý" }, { status: 400 });

  const { action, shelfAssignments } = parsed.data;

  if (action === "reject") {
    await prisma.transfer.update({ where: { id }, data: { status: "REJECTED" } });
    return NextResponse.json({ success: true });
  }

  // Xác nhận: cập nhật Lot sang kho mới + trừ tồn kho cũ
  const shelfMap = new Map(shelfAssignments?.map((a) => [a.lotId, a.shelfId]) ?? []);

  // Nguyên tắc kệ Phòng sáng: 1 kệ chỉ xếp 1 loại cây (nếu đã gán) và không vượt capacity —
  // kiểm tra trước khi cam kết, tính cả các lô khác trong cùng đợt xác nhận này dồn vào cùng 1 kệ.
  if (shelfAssignments && shelfAssignments.length > 0) {
    const shelfIds = Array.from(new Set(shelfAssignments.map((a) => a.shelfId)));
    const shelves = await prisma.shelf.findMany({
      where: { id: { in: shelfIds } },
      include: { lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } } },
    });
    const shelfById = new Map(shelves.map((s) => [s.id, s]));
    const batchQtyByShelf = new Map<string, number>();

    for (const a of shelfAssignments) {
      const item = transfer.items.find((i) => i.lotId === a.lotId);
      const shelf = shelfById.get(a.shelfId);
      if (!item || !shelf) return NextResponse.json({ message: "Dữ liệu kệ/lô không hợp lệ" }, { status: 400 });
      if (shelf.plantTypeId && shelf.plantTypeId !== item.lot.plantTypeId) {
        return NextResponse.json({ message: `Kệ ${shelf.code} đã gán cho loại cây khác — không thể xếp lô ${item.lot.code}` }, { status: 409 });
      }
      const addUnits = motherClusterUnits(item.lot.stageCode, item.lot.quantity);
      batchQtyByShelf.set(a.shelfId, (batchQtyByShelf.get(a.shelfId) ?? 0) + addUnits);
    }

    for (const [shelfId, addQty] of batchQtyByShelf) {
      const shelf = shelfById.get(shelfId)!;
      const existingQty = shelf.lots.reduce((s, l) => s + motherClusterUnits(l.stageCode, l.quantity), 0);
      if (shelf.capacity && existingQty + addQty > shelf.capacity) {
        return NextResponse.json({ message: `Kệ ${shelf.code} không đủ chỗ (còn trống ${Math.max(0, shelf.capacity - existingQty)}/${shelf.capacity})` }, { status: 409 });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const item of transfer.items) {
      const newShelfId = shelfMap.get(item.lotId);

      // Cập nhật vị trí kệ mới và trạng thái lot
      await tx.lot.update({
        where: { id: item.lotId },
        data: {
          shelfId: newShelfId ?? null,
          enteredAt: new Date(),
        },
      });
    }

    await tx.transfer.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
  });

  return NextResponse.json({ success: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const shelfInclude = {
    where: { isActive: true },
    include: {
      plantType: { select: { id: true, code: true, name: true } },
      lots: { where: { status: "ACTIVE" as const }, select: { quantity: true, stageCode: true } },
    },
  };
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      fromWarehouse: true,
      fromRoom: true,
      toWarehouse: { include: { shelves: { ...shelfInclude, where: { ...shelfInclude.where, roomId: null } } } },
      toRoom: { include: { shelves: shelfInclude } },
      fromUser: { select: { name: true } },
      toUser: { select: { name: true } },
      items: {
        include: {
          lot: { include: { plantType: true, shelf: true } },
        },
      },
    },
  });
  if (!transfer) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(transfer);
}
