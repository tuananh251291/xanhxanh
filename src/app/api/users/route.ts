import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["ADMIN", "KY_THUAT", "CAY_MO", "KHO_MO", "KHO_THANH_PHAM", "SALE", "MOI_TRUONG", "DIEU_PHOI"]),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: {
      id: true, code: true, name: true, email: true, role: true, status: true, isActive: true, createdAt: true,
      workplaceWarehouseId: true,
      workplaceWarehouse: { select: { code: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { name, email, password, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "Email đã tồn tại" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const userCount = await prisma.user.count();
  const code = `NV${String(userCount + 1).padStart(3, "0")}`;
  const user = await prisma.user.create({
    data: { code, name, email, password: hashed, role, status: "APPROVED" },
    select: { id: true, code: true, name: true, email: true, role: true },
  });

  return NextResponse.json(user, { status: 201 });
}
