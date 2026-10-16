import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidStaff, badRequest } from "@/lib/orchid/server";

// Xoá dòng bán/hỏng/báo tồn nhập nhầm. ?kind=sale|damage|stock
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidStaff();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind === "sale") await prisma.orchidRetailSale.delete({ where: { id } });
  else if (kind === "damage") await prisma.orchidRetailDamage.delete({ where: { id } });
  else if (kind === "stock") await prisma.orchidRetailStockReport.delete({ where: { id } });
  else return badRequest("Thiếu loại dữ liệu");
  return NextResponse.json({ success: true });
}
