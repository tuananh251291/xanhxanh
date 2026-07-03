import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
  lightRoomWeeksMin: z.number().int().min(1).default(4),
  lightRoomWeeksMax: z.number().int().min(1).default(6),
  finishedDaysMin: z.number().int().min(1).default(30),
  finishedDaysMax: z.number().int().min(1).default(45),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.plantType.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const existing = await prisma.plantType.findUnique({ where: { code: parsed.data.code } });
  if (existing) return NextResponse.json({ message: "Mã cây đã tồn tại" }, { status: 409 });
  const item = await prisma.plantType.create({ data: parsed.data });
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ message: "Thiếu ID" }, { status: 400 });
  const item = await prisma.plantType.update({ where: { id }, data });
  return NextResponse.json(item);
}
