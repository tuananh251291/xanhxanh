import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest } from "@/lib/orchid/server";
import { orchidSupplierSchema } from "@/lib/orchid/schemas";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const parsed = orchidSupplierSchema.safeParse(await req.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
  const supplier = await prisma.orchidSupplier.update({ where: { id }, data: parsed.data });
  return NextResponse.json(supplier);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  await prisma.orchidSupplier.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
