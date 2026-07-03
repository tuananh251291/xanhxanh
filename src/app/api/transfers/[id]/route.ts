import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { motherClusterUnits } from "@/types";
import { planShelfAssignments, ShelfAssignError } from "@/lib/shelf-assignment";
import { generateLotCode } from "@/lib/codes";
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
    include: {
      fromRoom: { select: { type: true, warehouseId: true } },
      items: {
        include: {
          lot: {
            include: {
              plantType: { select: { code: true } },
              instruction: { select: { assignedToId: true } },
            },
          },
        },
      },
    },
  });
  if (!transfer) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (transfer.status !== "PENDING") return NextResponse.json({ message: "Phiếu đã xử lý" }, { status: 400 });

  const { action, shelfAssignments } = parsed.data;

  if (action === "reject") {
    await prisma.transfer.update({ where: { id }, data: { status: "REJECTED" } });
    return NextResponse.json({ success: true });
  }

  // Bàn giao từ Phòng tối → Kho sáng: hệ thống tự chỉ định kệ (mẫu mẹ theo đúng NV phụ trách,
  // tràn 1800 cụm thì dồn sang Kho mẫu mẹ chung; cây ra rễ vào Phòng ra rễ) — không cần KHO_MO chọn tay.
  if (transfer.fromRoom?.type === "PHONG_TOI") {
    let placements;
    try {
      placements = await planShelfAssignments(
        transfer.items.map((i) => ({ lotId: i.lotId, lot: i.lot })),
        transfer.fromRoom.warehouseId
      );
    } catch (e) {
      if (e instanceof ShelfAssignError) return NextResponse.json({ message: e.message }, { status: 409 });
      throw e;
    }

    await prisma.$transaction(async (tx) => {
      const byLot = new Map<string, typeof placements>();
      for (const p of placements) {
        if (!byLot.has(p.lotId)) byLot.set(p.lotId, []);
        byLot.get(p.lotId)!.push(p);
      }
      for (const [lotId, parts] of byLot) {
        const [first, ...rest] = parts;
        const isSplit = rest.length > 0;
        await tx.lot.update({
          where: { id: lotId },
          data: {
            shelfId: first.shelfId,
            enteredAt: new Date(),
            ...(isSplit ? { quantity: first.quantity, initialQuantity: first.quantity } : {}),
          },
        });
        for (const part of rest) {
          const code = await generateLotCode(part.lot.stage);
          await tx.lot.create({
            data: {
              code,
              plantTypeId: part.lot.plantTypeId,
              stage: part.lot.stage,
              stageCode: part.lot.stageCode,
              shelfId: part.shelfId,
              quantity: part.quantity,
              initialQuantity: part.quantity,
              status: "ACTIVE",
              enteredAt: new Date(),
              instructionId: part.lot.instructionId,
              parentLotId: lotId,
            },
          });
        }
      }
      await tx.transfer.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    });

    return NextResponse.json({
      success: true,
      placements: placements.map((p) => ({
        lotCode: p.lot.code, shelfCode: p.shelfCode, quantity: p.quantity, pool: p.pool,
      })),
    });
  }

  // Các loại bàn giao khác: vẫn chọn kệ thủ công như trước.
  const shelfMap = new Map(shelfAssignments?.map((a) => [a.lotId, a.shelfId]) ?? []);

  // Nguyên tắc kệ Phòng mẫu mẹ: 1 kệ chỉ xếp 1 loại cây (nếu đã gán) và không vượt capacity —
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
