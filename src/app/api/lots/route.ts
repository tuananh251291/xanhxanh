import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const roomType = searchParams.get("roomType");
  const roomId = searchParams.get("roomId");
  const warehouseId = searchParams.get("warehouseId");
  const status = searchParams.get("status") ?? "ACTIVE";
  const instructionId = searchParams.get("instructionId");
  const assignedToId = searchParams.get("assignedToId");

  const where: Record<string, unknown> = {};
  if (stage) where.stage = stage;
  if (status) where.status = status;
  if (instructionId) where.instructionId = instructionId;

  if (roomId) {
    // Kho thành phẩm không quản lý theo giàn kệ — lô gắn thẳng vào phòng (roomId trực tiếp trên Lot).
    // Kho sản xuất vẫn gắn qua kệ (shelf.roomId).
    where.OR = [{ roomId }, { shelf: { roomId } }];
  } else if (warehouseId) {
    where.shelf = { warehouseId };
  } else if (roomType === "PHONG_TOI") {
    // Phòng tối cá nhân giờ là 1 Room riêng/NV — Lot gắn thẳng vào Room đó (roomId), không qua kệ.
    where.room = { type: "PHONG_TOI" };
  } else if (roomType) {
    where.shelf = { room: { type: roomType } };
  }

  if (assignedToId) {
    where.instruction = { assignedToId };
  }

  // CAY_MO can only see their own lots (from their instructions)
  const role = session.user.role;
  if (role === "CAY_MO" && !assignedToId) {
    where.instruction = { assignedToId: session.user.id };
  }

  const lots = await prisma.lot.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true, category: { select: { code: true, name: true } } } },
      shelf: {
        include: {
          warehouse: { select: { name: true, type: true } },
          room: { select: { name: true, type: true } },
        },
      },
      room: {
        select: { name: true, type: true, warehouse: { select: { name: true } } },
      },
      instruction: { select: { code: true, assignedToId: true, assignedTo: { select: { id: true, name: true } } } },
      _count: { select: { contaminations: true, instructionItems: true } },
    },
    orderBy: { enteredAt: "desc" },
    take: 200,
  });

  return NextResponse.json(lots);
}
