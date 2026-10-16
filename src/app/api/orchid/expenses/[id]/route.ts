import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidSuperAdmin } from "@/lib/orchid/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidSuperAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  await prisma.orchidExpense.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
