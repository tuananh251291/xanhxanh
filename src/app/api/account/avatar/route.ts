import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

// Chốt chặn phía server — FE (account/page.tsx) đã tự thu nhỏ ảnh về tối đa 256px + nén JPEG trước khi
// gửi lên (luôn ra vài chục KB), giới hạn này chỉ để chặn ai gọi thẳng API bỏ qua FE. Avatar lưu thẳng
// dạng data URL trong DB, không qua session/JWT (xem src/lib/auth.config.ts) — nhưng vẫn phải nhỏ để an
// toàn nếu sau này có chỗ nào lại vô tình đưa vào session, và để không phình DB/mọi query có avatar.
const MAX_DATA_URL_LENGTH = 300_000; // ~220KB ảnh gốc sau base64 — dư nhiều so với ảnh đã nén ở FE

const avatarSchema = z.object({
  avatar: z
    .string()
    .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "File phải là ảnh (png/jpeg/webp)")
    .max(MAX_DATA_URL_LENGTH, "Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn"),
});

// Avatar KHÔNG nằm trong session/JWT (xem comment ở src/lib/auth.config.ts) — nơi cần hiển thị/chỉnh sửa
// avatar của chính mình phải tự gọi endpoint này thay vì đọc qua useSession().
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { avatar: true } });
  return NextResponse.json({ avatar: user?.avatar ?? null });
}

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
