import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

// Có cả /api — để chặn tài khoản bên ngoài Dự án hoa lan gọi API nội bộ (xem authorized() ở
// src/lib/auth.config.ts). Người dùng nội bộ: /api luôn đi qua, route tự check quyền như trước.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
