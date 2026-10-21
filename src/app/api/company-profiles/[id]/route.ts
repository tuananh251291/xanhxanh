import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyProfileSchema } from "@/lib/company-profile";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Chỉ Admin cấp cao" }, { status: 403 });
  const parsed = companyProfileSchema.partial().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const { id } = await params;
  const row = await prisma.companyProfile.update({ where: { id }, data: parsed.data });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Chỉ Admin cấp cao" }, { status: 403 });
  const { id } = await params;
  await prisma.companyProfile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
