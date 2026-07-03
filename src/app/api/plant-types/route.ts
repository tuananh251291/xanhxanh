import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  categoryId: z.string().min(1, "Cần chọn loại cây"),
  name: z.string().min(2),
  description: z.string().optional(),
  lightRoomWeeksMin: z.number().int().min(1).default(4),
  lightRoomWeeksMax: z.number().int().min(1).default(6),
  finishedDaysMin: z.number().int().min(1).default(30),
  finishedDaysMax: z.number().int().min(1).default(45),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  lightRoomWeeksMin: z.number().int().min(1).optional(),
  lightRoomWeeksMax: z.number().int().min(1).optional(),
  finishedDaysMin: z.number().int().min(1).optional(),
  finishedDaysMax: z.number().int().min(1).optional(),
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

  const { categoryId, ...data } = parsed.data;
  const category = await prisma.plantCategory.findUnique({ where: { id: categoryId } });
  if (!category) return NextResponse.json({ message: "Không tìm thấy loại cây" }, { status: 404 });

  // Chi tiết loại cây mới trong 1 Loại cây luôn lấy số thứ tự lớn nhất hiện có + 1 (kể cả đã xóa/vô hiệu
  // hóa) để mã không bao giờ trùng.
  const maxSeq = await prisma.plantType.aggregate({ where: { categoryId }, _max: { seq: true } });
  const seq = (maxSeq._max.seq ?? 0) + 1;
  if (seq > 999) return NextResponse.json({ message: "Loại cây này đã đủ 999 chi tiết" }, { status: 409 });
  const code = `${category.code}${String(seq).padStart(3, "0")}`;

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
