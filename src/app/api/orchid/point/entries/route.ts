import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidPoint, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { orchidPointEntrySchema } from "@/lib/orchid/schemas";
import { createOrchidPointEntry } from "@/lib/orchid/retail";

// Điểm bán tự nhập: bán hàng / cây hỏng / số cây còn.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidPoint();
  if ("error" in guard) return guard.error;
  const parsed = orchidPointEntrySchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return handleOrchidError(async () => {
    const entry = await prisma.$transaction((tx) => createOrchidPointEntry(tx, guard.point.id, parsed.data, guard.user));
    return NextResponse.json(entry, { status: 201 });
  });
}
