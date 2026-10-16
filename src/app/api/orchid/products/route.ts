import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError, ORCHID_CODE, withCodeRetry } from "@/lib/orchid/server";
import { orchidProductSchema } from "@/lib/orchid/schemas";

export async function POST(req: NextRequest) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const parsed = orchidProductSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { priceTiers, code, ...data } = parsed.data;

  return handleOrchidError(async () => {
    const product = await withCodeRetry(() =>
      prisma.$transaction(async (tx) => {
        const finalCode = code?.trim() || (await ORCHID_CODE.product(tx));
        return tx.orchidProduct.create({
          data: {
            ...data,
            code: finalCode,
            youtubeUrl: data.youtubeUrl || null,
            supplierId: data.supplierId || null,
            priceTiers: { create: priceTiers },
          },
        });
      })
    );
    return NextResponse.json(product, { status: 201 });
  });
}
