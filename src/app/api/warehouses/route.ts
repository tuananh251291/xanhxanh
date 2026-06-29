import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  type: z.enum(["PHONG_TOI", "KHO_SANG", "KHO_THANH_PHAM"]),
  description: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const warehouses = await prisma.warehouse.findMany({
    include: { shelves: { where: { isActive: true } } },
    orderBy: { type: "asc" },
  });
  return NextResponse.json(warehouses);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const existing = await prisma.warehouse.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return NextResponse.json({ message: "Mã kho đã tồn tại" }, { status: 409 });
  }

  const warehouse = await prisma.warehouse.create({ data: parsed.data });
  return NextResponse.json(warehouse, { status: 201 });
}
