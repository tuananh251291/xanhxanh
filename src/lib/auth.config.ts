import type { NextAuthConfig } from "next-auth";
import type { UserRole, UserStatus } from "@prisma/client";

// Edge-safe config — không import Prisma, chỉ dùng JWT
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
        token.id = user.id;
        token.avatar = (user as { avatar?: string | null }).avatar ?? null;
        token.workplaceWarehouseId = (user as { workplaceWarehouseId?: string | null }).workplaceWarehouseId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.role = token.role as UserRole | null;
        session.user.status = token.status as UserStatus;
        session.user.id = token.id as string;
        session.user.avatar = (token.avatar as string | null) ?? null;
        session.user.workplaceWarehouseId = (token.workplaceWarehouseId as string | null) ?? null;
      }
      return session;
    },
  },
};
