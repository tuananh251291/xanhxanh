import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  role: z.enum([
    "SUPER_ADMIN", "ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI",
  ]),
  title: z.string().min(1, "Cần nhập nội dung đầu việc"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.checklistTemplate.findMany({
    orderBy: [{ role: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const maxOrder = await prisma.checklistTemplate.aggregate({
    where: { role: parsed.data.role },
    _max: { sortOrder: true },
  });

  const template = await prisma.checklistTemplate.create({
    data: { ...parsed.data, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
  });
  return NextResponse.json(template, { status: 201 });
}
