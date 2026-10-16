import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { orchidPointEntrySchema } from "@/lib/orchid/schemas";
import { createOrchidPointEntry } from "@/lib/orchid/retail";

// Admin hoa lan/Trợ lý hoa lan nhập hộ bán hàng / cây hỏng / báo tồn cho 1 điểm bán.
export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const body = await req.json();
  const pointId = z.string().min(1).safeParse(body?.pointId);
  const parsed = orchidPointEntrySchema.safeParse(body);
  if (!pointId.success) return badRequest("Thiếu điểm bán");
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return handleOrchidError(async () => {
    const entry = await prisma.$transaction((tx) => createOrchidPointEntry(tx, pointId.data, parsed.data, guard.user));
    return NextResponse.json(entry, { status: 201 });
  });
}
