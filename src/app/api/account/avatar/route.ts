import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const MAX_DATA_URL_LENGTH = 2_000_000; // ~1.5MB ảnh gốc sau base64

const avatarSchema = z.object({
  avatar: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "File phải là ảnh (png/jpeg/webp)")
    .max(MAX_DATA_URL_LENGTH, "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn"),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = avatarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { avatar: parsed.data.avatar },
  });

  return NextResponse.json({ message: "Đã cập nhật ảnh đại diện" });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  await prisma.user.update({ where: { id: session.user.id }, data: { avatar: null } });
  return NextResponse.json({ message: "Đã xóa ảnh đại diện" });
}
