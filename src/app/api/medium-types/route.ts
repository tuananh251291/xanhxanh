import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.mediumType.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const existing = await prisma.mediumType.findUnique({ where: { code: parsed.data.code } });
  if (existing) return NextResponse.json({ message: "Mã môi trường đã tồn tại" }, { status: 409 });
  const item = await prisma.mediumType.create({ data: parsed.data });
  return NextResponse.json(item, { status: 201 });
}
