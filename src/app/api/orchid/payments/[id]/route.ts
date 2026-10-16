import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrchidSuperAdmin, badRequest } from "@/lib/orchid/server";

// Xoá phiếu thu/chi ghi nhầm — chỉ Admin hoa lan (giữ dấu vết sổ công nợ). ?kind=customer|supplier|point
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrchidSuperAdmin();
  if ("error" in guard) return guard.error;
  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind === "customer") await prisma.orchidCustomerPayment.delete({ where: { id } });
  else if (kind === "supplier") await prisma.orchidSupplierPayment.delete({ where: { id } });
  else if (kind === "point") await prisma.orchidRetailPayment.delete({ where: { id } });
  else return badRequest("Thiếu loại phiếu");
  return NextResponse.json({ success: true });
}
