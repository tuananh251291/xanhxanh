import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateProductionGardenCode } from "@/lib/codes";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2),
  address: z.string().min(2),
  managerId: z.string().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.productionGarden.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    include: { manager: { select: { id: true, code: true, name: true } } },
  });
  return NextResponse.json(items);
}

// Chỉ Admin cấp cao (SUPER_ADMIN) tạo Vườn sản xuất.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền tạo Vườn sản xuất" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { name, address, managerId } = parsed.data;

  if (managerId) {
    const manager = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true } });
    if (!manager || manager.role !== "NHAN_VIEN_QUAN_LY_VUON") {
      return NextResponse.json({ message: "Chỉ gán được NV Quản lý vườn làm người quản lý" }, { status: 400 });
    }
  }

  const code = await generateProductionGardenCode();
  const item = await prisma.productionGarden.create({
    data: { code, name, address, managerId: managerId || null },
    include: { manager: { select: { id: true, code: true, name: true } } },
  });
  return NextResponse.json(item, { status: 201 });
}
