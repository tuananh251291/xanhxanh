import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được sửa thị trường" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const data: { code?: string; name?: string; isActive?: boolean } = { ...parsed.data };
  if (data.code) {
    data.code = data.code.toUpperCase();
    const existing = await prisma.market.findUnique({ where: { code: data.code } });
    if (existing && existing.id !== id) {
      return NextResponse.json({ message: `Mã thị trường "${data.code}" đã tồn tại` }, { status: 409 });
    }
  }

  const market = await prisma.market.update({ where: { id }, data });
  return NextResponse.json(market);
}
