import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const createSchema = z.object({
  label: z.string().min(1, "Cần nhập tên lỗi vi phạm"),
  // Điểm trừ CƠ BẢN khi mắc lỗi này (dùng tính điểm tuân thủ cho lương — xem
  // src/lib/violation-points.ts). Mặc định 5 nếu không truyền, khớp default ở schema.prisma.
  points: z.number().int().min(0).max(100).optional(),
});

// Danh mục loại lỗi vi phạm dùng khi ghi nhận "Kiểm tra kho cá nhân" — Admin soạn sẵn (Settings), NV kho
// mô cũng tự thêm được ngay lúc ghi nhận (đã chốt với chủ dự án, không chỉ Admin quản lý).
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const types = await prisma.violationType.findMany({
    where: { isActive: true },
    orderBy: { label: "asc" },
  });
  return NextResponse.json(types);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (!isAdminRole(role) && role !== "KHO_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const existing = await prisma.violationType.findUnique({ where: { label: parsed.data.label } });
  if (existing) {
    if (!existing.isActive) {
      const reactivated = await prisma.violationType.update({ where: { id: existing.id }, data: { isActive: true } });
      return NextResponse.json(reactivated);
    }
    return NextResponse.json({ message: "Loại lỗi vi phạm này đã có trong danh sách" }, { status: 400 });
  }

  const type = await prisma.violationType.create({
    data: { label: parsed.data.label, points: parsed.data.points ?? 5, createdById: session!.user!.id },
  });
  return NextResponse.json(type, { status: 201 });
}
