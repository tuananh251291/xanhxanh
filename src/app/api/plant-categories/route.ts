import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().trim().min(2).max(3).regex(/^[A-Za-z]+$/, "Mã loại cây chỉ gồm chữ cái"),
  name: z.string().min(2),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.plantCategory.findMany({
    orderBy: { code: "asc" },
    include: { plantTypes: { orderBy: { seq: "asc" } } },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const code = parsed.data.code.toUpperCase();
  const existing = await prisma.plantCategory.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ message: "Mã loại cây đã tồn tại" }, { status: 409 });

  const item = await prisma.plantCategory.create({ data: { code, name: parsed.data.name } });
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { id, ...data } = parsed.data;
  const item = await prisma.plantCategory.update({ where: { id }, data });
  return NextResponse.json(item);
}
