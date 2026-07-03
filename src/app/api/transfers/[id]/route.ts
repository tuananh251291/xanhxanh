import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      fromWarehouse: true,
      fromRoom: true,
      toWarehouse: { include: { shelves: { where: { isActive: true, roomId: null } } } },
      toRoom: { include: { shelves: { where: { isActive: true } } } },
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
