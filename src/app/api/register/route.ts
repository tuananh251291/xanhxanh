import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "Email đã tồn tại" }, { status: 409 });
  }

  // Vai trò chưa được chọn ở bước đăng ký (Admin cao nhất chọn khi duyệt) nên chưa thể sinh mã theo
  // đúng định dạng vai trò — dùng mã tạm, sẽ được thay bằng mã thật (xem generateUserCode) lúc duyệt.
  const hashed = await bcrypt.hash(password, 10);
  const userCount = await prisma.user.count();
  const code = `TEMP${String(userCount + 1).padStart(4, "0")}`;
  const user = await prisma.user.create({
    data: { code, name, email, password: hashed, role: null, status: "PENDING" },
    select: { id: true, code: true, name: true, email: true },
  });

  return NextResponse.json(user, { status: 201 });
}
