import type { NextAuthConfig } from "next-auth";
import type { UserRole, UserStatus } from "@prisma/client";
import { ORCHID_SCOPED_HOME } from "@/types";

// Edge-safe config — không import Prisma, chỉ dùng JWT
// KHÔNG đưa User.avatar (data URL base64 ảnh, có thể tới ~1.5MB) vào token/session — JWT strategy mã hoá
// thẳng vào cookie Set-Cookie, ảnh lớn khiến header response vượt giới hạn buffer của nginx (lỗi thực tế
// gặp phải: "upstream sent too big header", NV có avatar không đăng nhập được nữa, mọi request sau đó
// cũng lỗi tương tự vì jwt() nạp lại avatar từ DB mỗi lần). Nơi cần hiển thị avatar phải tự query DB
// riêng (xem (dashboard)/layout.tsx, GET /api/account/avatar) thay vì đọc qua session.
export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: { signIn: "/login" },
  // Phiên hết hạn sau 12 giờ KHÔNG thao tác (mặc định NextAuth 30 ngày — máy quên đăng xuất thì người khác dùng
  // được tài khoản suốt 30 ngày). Hạn tự gia hạn mỗi lần đi qua proxy (JWT được ký lại với hạn mới), nên NV
  // làm cả ca không bị đăng xuất giữa chừng; bỏ máy quá 12 giờ phải đăng nhập lại.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;

      // Tài khoản Dự án hoa lan (Admin/Trợ lý hoa lan, Khách hàng lan, Điểm bán lẻ lan) — CHỈ được vào đúng
      // khu riêng của mình. Nhiều API nội bộ cũ chỉ check "đã đăng nhập" (VD GET /api/suppliers) nên phải chặn
      // tập trung ở đây thay vì trông vào từng route (matcher của proxy.ts có cả /api vì lý do này).
      const role = (auth?.user as { role?: UserRole | null } | undefined)?.role ?? null;
      const scope = role ? ORCHID_SCOPED_HOME[role] : undefined;
      if (isLoggedIn && scope) {
        const { home: externalHome, apiPrefix } = scope;
        if (path.startsWith("/api/")) {
          const allowed = path.startsWith("/api/auth") || path.startsWith("/api/account") || path.startsWith(apiPrefix);
          return allowed ? true : Response.json({ message: "Không có quyền" }, { status: 403 });
        }
        const allowedPage = path === externalHome || path.startsWith(externalHome + "/") || path.startsWith("/account");
        if (!allowedPage) return Response.redirect(new URL(externalHome, nextUrl));
        return true;
      }
      // API tự xử lý xác thực riêng (trả JSON 401, không redirect về /login) — proxy chỉ chặn tài khoản hoa lan.
      if (path.startsWith("/api/")) return true;
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
