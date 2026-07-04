import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  categoryId: z.string().min(1, "Cần chọn loại cây"),
  codeSuffix: z.string().trim().length(3, "Cần đúng 3 ký tự").regex(/^[A-Za-z0-9]{3}$/, "Chỉ gồm chữ và số"),
  name: z.string().min(2),
  description: z.string().optional(),
  transferWaitWeeks: z.number().int().min(1).default(5),
  rootingWeeks: z.number().int().min(1).default(5),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  transferWaitWeeks: z.number().int().min(1).optional(),
  rootingWeeks: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { categoryId, codeSuffix, ...data } = parsed.data;
  const category = await prisma.plantCategory.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ message: "Không tìm thấy loại cây" }, { status: 404 });

  // Mã cây = 2 ký tự mã Loại cây (tự lấy theo Loại cây đã chọn) + 3 ký tự NV nhập tay (codeSuffix).
  const code = `${category.code}${codeSuffix.toUpperCase()}`;
  const existing = await prisma.plantType.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ message: `Mã cây "${code}" đã có sẵn trong hệ thống` }, { status: 409 });

  // seq chỉ dùng để sắp thứ tự hiển thị trong Loại cây, không còn quyết định mã cây — luôn lấy số lớn
  // nhất hiện có + 1 (kể cả đã xóa/vô hiệu hóa).
  const maxSeq = await prisma.plantType.aggregate({ where: { categoryId }, _max: { seq: true } });
  const seq = (maxSeq._max.seq ?? 0) + 1;

  const item = await prisma.plantType.create({ data: { ...data, categoryId, seq, code } });
  return NextResponse.json(item, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { id, ...data } = parsed.data;
  const item = await prisma.plantType.update({ where: { id }, data });
  return NextResponse.json(item);
}
