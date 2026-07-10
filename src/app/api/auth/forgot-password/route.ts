import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const schema = z.object({ email: z.string().email() });

// Công khai (chưa đăng nhập gọi được) — NV bấm "Quên mật khẩu" ở trang đăng nhập chỉ tạo thông báo cho
// SUPER_ADMIN, KHÔNG tự đổi/gửi mật khẩu mới qua hệ thống. SUPER_ADMIN chủ động liên hệ NV (ngoài hệ
// thống) để cấp lại mật khẩu mới qua trang /users (sửa tài khoản). Luôn trả cùng 1 thông báo chung dù
// email có tồn tại hay không, tránh lộ thông tin email nào đã đăng ký.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Email không hợp lệ" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, code: true, name: true, email: true } });
  if (user) {
    await createAlert({
      type: "PASSWORD_RESET_REQUESTED",
      title: "Yêu cầu cấp lại mật khẩu",
      message: `${user.name} (${user.code} — ${user.email}) yêu cầu cấp lại mật khẩu — liên hệ trực tiếp để cấp mật khẩu mới`,
      targetRole: "SUPER_ADMIN",
      relatedId: user.id,
      relatedType: "User",
    });
  }

  return NextResponse.json({
    message: "Nếu email tồn tại trong hệ thống, yêu cầu đã được gửi tới Admin cấp cao. Admin sẽ liên hệ trực tiếp để cấp lại mật khẩu.",
  });
}
