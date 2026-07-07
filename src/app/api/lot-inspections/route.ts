import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getInspectionDueAt } from "@/lib/inspection";
import { addToContaminationRoom } from "@/lib/contamination-room";
import { z } from "zod";

const schema = z.object({
  items: z.array(z.object({
    lotId: z.string(),
    contaminatedQuantity: z.number().int().min(0),
  })).min(1, "Cần ít nhất 1 lô để kiểm tra"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { items } = parsed.data;
  const lots = await prisma.lot.findMany({
    where: { id: { in: items.map((i) => i.lotId) } },
    include: {
      plantType: { select: { code: true } },
      room: { select: { assignedStaffId: true, warehouseId: true, warehouse: { select: { code: true } } } },
      shelf: { select: { assignedStaffId: true, warehouseId: true, warehouse: { select: { code: true } } } },
      instruction: { select: { assignedToId: true } },
    },
  });

  if (lots.length !== items.length) {
    return NextResponse.json({ message: "Không tìm thấy một số lô" }, { status: 404 });
  }
  // Phòng tối cá nhân giờ là Room-based (Lot.roomId, xem src/lib/dark-room.ts) — ưu tiên xét theo
  // assignedStaffId của room đó. Vẫn giữ nhánh shelf cho dữ liệu kiểu cũ, và fallback theo người phụ
  // trách chỉ định cấy cho lô chưa gắn room/shelf nào (xem logic tương tự ở GET /api/lots).
  const isOwnLot = (lot: (typeof lots)[number]) => {
    if (lot.room) return lot.room.assignedStaffId === session.user.id;
    if (lot.shelf) return lot.shelf.assignedStaffId === session.user.id;
    return lot.instruction?.assignedToId === session.user.id;
  };
  if (lots.some((lot) => !isOwnLot(lot))) {
    return NextResponse.json({ message: "Không có quyền kiểm tra lô này" }, { status: 403 });
  }
  const code = lots[0].code;
  if (lots.some((lot) => lot.code !== code)) {
    return NextResponse.json({ message: "Các lô không cùng 1 lô sản phẩm" }, { status: 400 });
  }
  if (lots.some((lot) => lot.inspectedAt)) {
    return NextResponse.json({ message: "Lô này đã được kiểm tra" }, { status: 400 });
  }

  const now = new Date();
  if (lots.some((lot) => getInspectionDueAt(lot.enteredAt) > now)) {
    return NextResponse.json({ message: "Chưa đủ thời gian ủ tối để kiểm tra" }, { status: 400 });
  }

  const itemByLotId = new Map(items.map((i) => [i.lotId, i]));
  if (lots.some((lot) => itemByLotId.get(lot.id)!.contaminatedQuantity > lot.quantity)) {
    return NextResponse.json({ message: "Số nhiễm vượt quá tồn hiện tại của lô" }, { status: 400 });
  }

  const inspectionItems = lots.map((lot) => {
    const contaminatedQuantity = itemByLotId.get(lot.id)!.contaminatedQuantity;
    return {
      lotId: lot.id,
      stageCode: lot.stageCode,
      initialQuantity: lot.initialQuantity,
      contaminatedQuantity,
      passedQuantity: lot.initialQuantity - contaminatedQuantity,
    };
  });

  const totals = inspectionItems.reduce(
    (acc, item) => ({
      totalQuantity: acc.totalQuantity + item.initialQuantity,
      contaminatedQuantity: acc.contaminatedQuantity + item.contaminatedQuantity,
      passedQuantity: acc.passedQuantity + item.passedQuantity,
    }),
    { totalQuantity: 0, contaminatedQuantity: 0, passedQuantity: 0 },
  );

  const inspection = await prisma.$transaction(async (tx) => {
    const created = await tx.lotInspection.create({
      data: {
        code,
        staffId: session.user.id,
        ...totals,
        items: { create: inspectionItems },
      },
      include: { items: true },
    });

    for (const lot of lots) {
      const contaminatedQuantity = itemByLotId.get(lot.id)!.contaminatedQuantity;
      await tx.lot.update({
        where: { id: lot.id },
        data: {
          inspectedAt: now,
          inspectedById: session.user.id,
          ...(contaminatedQuantity > 0 ? { quantity: { decrement: contaminatedQuantity } } : {}),
        },
      });

      if (contaminatedQuantity > 0) {
        const warehouseId = lot.room?.warehouseId ?? lot.shelf?.warehouseId;
        const warehouseCode = lot.room?.warehouse.code ?? lot.shelf?.warehouse.code;
        if (warehouseId && warehouseCode) {
          await addToContaminationRoom(tx, {
            warehouseId,
            warehouseCode,
            plantTypeId: lot.plantTypeId,
            plantTypeCode: lot.plantType.code,
            stage: lot.stage,
            stageCode: lot.stageCode,
            quantity: contaminatedQuantity,
          });
        }
      }
    }

    return created;
  });

  return NextResponse.json(inspection, { status: 201 });
}
