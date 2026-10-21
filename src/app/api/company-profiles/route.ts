import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { companyProfileSchema } from "@/lib/company-profile";

// Mẫu thông tin công ty in trên invoice — Admin cấp cao quản lý; NV bán hàng (và các vai trò lập invoice) chỉ đọc
// danh sách đang dùng để chọn.

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const all = session.user.role === "SUPER_ADMIN";
  const rows = await prisma.companyProfile.findMany({ where: all ? undefined : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Chỉ Admin cấp cao" }, { status: 403 });
  const parsed = companyProfileSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const row = await prisma.companyProfile.create({ data: parsed.data });
  return NextResponse.json(row, { status: 201 });
}
