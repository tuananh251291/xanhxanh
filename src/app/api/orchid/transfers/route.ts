import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, withCodeRetry } from "@/lib/orchid/server";
import { orchidTransferSchema } from "@/lib/orchid/schemas";
import { createOrchidTransfer } from "@/lib/orchid/retail";

export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidTransferSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return handleOrchidError(async () => {
    const transfer = await withCodeRetry(() => prisma.$transaction((tx) => createOrchidTransfer(tx, parsed.data, guard.user)));
    return NextResponse.json(transfer, { status: 201 });
  });
}
