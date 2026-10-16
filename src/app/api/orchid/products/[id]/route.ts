import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest, handleOrchidError } from "@/lib/orchid/server";
import { orchidProductSchema } from "@/lib/orchid/schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = orchidProductSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const { priceTiers, code, ...data } = parsed.data;

  return handleOrchidError(async () => {
    const product = await prisma.$transaction(async (tx) => {
      await tx.orchidPriceTier.deleteMany({ where: { productId: id } });
      return tx.orchidProduct.update({
        where: { id },
        data: {
          ...data,
          ...(code?.trim() ? { code: code.trim() } : {}),
          youtubeUrl: data.youtubeUrl || null,
          supplierId: data.supplierId || null,
          priceTiers: { create: priceTiers },
        },
      });
    });
    return NextResponse.json(product);
  });
}

// Ngừng kinh doanh (ẩn) — không xoá cứng vì lô/đơn cũ còn tham chiếu.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  await prisma.orchidProduct.update({ where: { id }, data: { isActive: false, showToCustomer: false } });
  return NextResponse.json({ success: true });
}
