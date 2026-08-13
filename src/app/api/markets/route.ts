import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const createSchema = z.object({
  code: z.string().trim().min(1, "Nhập mã thị trường"),
  name: z.string().trim().min(1, "Nhập tên đầy đủ thị trường"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const markets = await prisma.market.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json(markets);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được tạo thị trường" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const code = parsed.data.code.toUpperCase();
  const existing = await prisma.market.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ message: `Mã thị trường "${code}" đã tồn tại` }, { status: 409 });

  const market = await prisma.market.create({ data: { code, name: parsed.data.name } });
  return NextResponse.json(market, { status: 201 });
}
