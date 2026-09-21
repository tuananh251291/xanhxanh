import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const createSchema = z.object({ label: z.string().trim().min(1, "Cần nhập tên lỗi cấy") });

// Danh mục "Phân loại lỗi cấy" — NV Kỹ thuật soạn, dùng CHUNG cho mọi NV Kỹ thuật. Không có DELETE/PATCH ở
// đây — cố tình để không ai xoá/sửa được sau khi đã thêm, xem PlantingErrorType ở schema.prisma.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.plantingErrorType.findMany({
    orderBy: { label: "asc" },
    select: { id: true, label: true, createdAt: true, createdBy: { select: { name: true, code: true } } },
  });
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KY_THUAT" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const existing = await prisma.plantingErrorType.findUnique({ where: { label: parsed.data.label } });
  if (existing) return NextResponse.json({ message: "Loại lỗi cấy này đã có trong danh sách" }, { status: 400 });

  const type = await prisma.plantingErrorType.create({
    data: { label: parsed.data.label, createdById: session!.user!.id },
    select: { id: true, label: true, createdAt: true, createdBy: { select: { name: true, code: true } } },
  });
  return NextResponse.json(type, { status: 201 });
}
