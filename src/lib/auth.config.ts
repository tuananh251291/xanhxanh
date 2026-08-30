import type { NextAuthConfig } from "next-auth";
import type { UserRole, UserStatus } from "@prisma/client";

// Edge-safe config — không import Prisma, chỉ dùng JWT
// KHÔNG đưa User.avatar (data URL base64 ảnh, có thể tới ~1.5MB) vào token/session — JWT strategy mã hoá
// thẳng vào cookie Set-Cookie, ảnh lớn khiến header response vượt giới hạn buffer của nginx (lỗi thực tế
// gặp phải: "upstream sent too big header", NV có avatar không đăng nhập được nữa, mọi request sau đó
// cũng lỗi tương tự vì jwt() nạp lại avatar từ DB mỗi lần). Nơi cần hiển thị avatar phải tự query DB
// riêng (xem (dashboard)/layout.tsx, GET /api/account/avatar) thay vì đọc qua session.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isPublicPage =
        nextUrl.pathname.startsWith("/login") || nextUrl.pathname.startsWith("/register");

      if (isPublicPage) {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }

      if (!isLoggedIn) return false;
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: UserRole | null }).role;
        token.status = (user as { status: UserStatus }).status;
        token.id = user.id as string;
        token.workplaceWarehouseId = (user as { workplaceWarehouseId?: string | null }).workplaceWarehouseId ?? null;
        token.holdDays = (user as { holdDays?: number | null }).holdDays ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.role = token.role as UserRole | null;
        session.user.status = token.status as UserStatus;
        session.user.id = token.id as string;
        session.user.workplaceWarehouseId = (token.workplaceWarehouseId as string | null) ?? null;
        session.user.holdDays = (token.holdDays as number | null) ?? null;
        session.user.sessionRevoked = !!token.sessionRevoked;
      }
      return session;
    },
  },
};
