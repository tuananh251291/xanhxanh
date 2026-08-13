import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được xoá phân công quản lý" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.salesManagerAssignment.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
