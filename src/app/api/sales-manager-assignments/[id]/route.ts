import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageSaleCustomers } from "@/types";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canManageSaleCustomers(session?.user?.role)) {
    return NextResponse.json({ message: "Chỉ Admin cấp cao / NV Trợ lý mới được xoá phân công quản lý" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.salesManagerAssignment.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
