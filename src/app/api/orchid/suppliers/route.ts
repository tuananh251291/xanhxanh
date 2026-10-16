import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry } from "@/lib/orchid/server";
import { orchidSupplierSchema } from "@/lib/orchid/schemas";

export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidSupplierSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  return handleOrchidError(async () => {
    const supplier = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => tx.orchidSupplier.create({ data: { ...parsed.data, code: await ORCHID_CODE.supplier(tx) } }))
    );
    return NextResponse.json(supplier, { status: 201 });
  });
}
