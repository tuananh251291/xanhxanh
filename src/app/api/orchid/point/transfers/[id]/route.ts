import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrchidPoint, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { receiveOrchidTransfer } from "@/lib/orchid/retail";

const schema = z.object({
  receivedQuantity: z.number().int().min(0),
  receivedBy: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

// Điểm bán xác nhận nhận hàng (số thực nhận).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidPoint();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return badRequest("Dữ liệu không hợp lệ");
  return handleOrchidError(async () => {
    await prisma.$transaction((tx) =>
      receiveOrchidTransfer(tx, id, guard.point.id, parsed.data.receivedQuantity, parsed.data.receivedBy || guard.user.name, parsed.data.note ?? null)
    );
    return NextResponse.json({ success: true });
  });
}
