import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  unit: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.material.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  return NextResponse.json(items);
}

// Mã vật tư chỉ do Admin cấp cao (SUPER_ADMIN) tạo.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền tạo vật tư" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const existing = await prisma.material.findUnique({ where: { code: parsed.data.code } });
  if (existing) return NextResponse.json({ message: "Mã vật tư đã tồn tại" }, { status: 409 });
  const item = await prisma.material.create({ data: parsed.data });
  return NextResponse.json(item, { status: 201 });
}
