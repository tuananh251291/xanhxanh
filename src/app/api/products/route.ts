import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  code: z.string().trim().min(2).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1),
  botanicalName: z.string().trim().optional(),
  unit: z.string().trim().optional(),
});

// Mã/tên sản phẩm chỉ do Admin cấp cao (SUPER_ADMIN) tạo — mã phải khớp đúng "Item code" trên invoice
// xuất khẩu để /api/price-check đối chiếu được (xem src/lib/price-check.ts).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const items = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    include: { prices: { orderBy: { effectiveMonth: "desc" } } },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới có quyền tạo sản phẩm" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { code, name, botanicalName, unit } = parsed.data;

  const existing = await prisma.product.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ message: `Mã sản phẩm "${code}" đã tồn tại` }, { status: 409 });
  }

  const item = await prisma.product.create({
    data: { code, name, botanicalName: botanicalName || null, unit: unit || null },
  });
  return NextResponse.json(item, { status: 201 });
}
