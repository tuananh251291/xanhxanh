import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { cancelOrchidTransfer, receiveOrchidTransfer } from "@/lib/orchid/retail";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({
    action: z.literal("receive"),
    receivedQuantity: z.number().int().min(0),
    receivedBy: z.string().max(200).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const body = parsed.data;
  return handleOrchidError(async () => {
    await prisma.$transaction((tx) =>
      body.action === "cancel"
        ? cancelOrchidTransfer(tx, id)
        : receiveOrchidTransfer(tx, id, null, body.receivedQuantity, body.receivedBy ?? null, body.note ?? null)
    );
    return NextResponse.json({ success: true });
  });
}
