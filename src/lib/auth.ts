import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { UserRole, UserStatus } from "@prisma/client";
import { authConfig } from "@/lib/auth.config";
import { createAlert } from "@/lib/inventory";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;

// Ném từ authorize() khi tài khoản đang bị khóa (hoặc lần này vừa là lần sai thứ 5) — code riêng để
// trang đăng nhập phân biệt được với "sai mật khẩu" thông thường qua result.code phía client.
class AccountLockedError extends CredentialsSignin {
  code = "account-locked";
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: UserRole | null }).role;
        token.status = (user as { status: UserStatus }).status;
        token.id = user.id as string;
        token.avatar = (user as { avatar?: string | null }).avatar ?? null;
        token.workplaceWarehouseId = (user as { workplaceWarehouseId?: string | null }).workplaceWarehouseId ?? null;
        return token;
      }
      // Làm mới role/status/isActive/avatar/workplaceWarehouseId từ DB mỗi request, để Admin duyệt/đổi
      // vai trò/khóa tài khoản/đổi địa điểm làm việc có hiệu lực ngay mà không cần đăng xuất
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, status: true, isActive: true, avatar: true, workplaceWarehouseId: true },
        });
        if (!dbUser || !dbUser.isActive) {
          token.status = "REJECTED";
        } else {
          token.role = dbUser.role;
          token.status = dbUser.status;
          token.avatar = dbUser.avatar;
          token.workplaceWarehouseId = dbUser.workplaceWarehouseId;
        }
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive) return null;
        if (user.status === "REJECTED") return null;
        // Đã bị khóa từ trước (đủ 5 lần sai) — chặn đăng nhập dù lần này gõ đúng mật khẩu, chỉ
        // SUPER_ADMIN mở khóa lại được (xem PATCH /api/users/[id]).
        if (user.lockedAt) throw new AccountLockedError();

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!valid) {
          const attempts = user.failedLoginAttempts + 1;
          if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: attempts, lockedAt: new Date() },
            });
            await createAlert({
              type: "ACCOUNT_LOCKED",
              title: "Tài khoản bị khóa",
              message: `Tài khoản ${user.name} (${user.email}) đã bị khóa do đăng nhập sai mật khẩu ${MAX_FAILED_LOGIN_ATTEMPTS} lần liên tiếp — cần mở khóa lại`,
              targetRole: "SUPER_ADMIN",
              relatedId: user.id,
              relatedType: "User",
            });
            throw new AccountLockedError();
          }
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts } });
          return null;
        }

        if (user.failedLoginAttempts > 0) {
          await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          avatar: user.avatar,
          workplaceWarehouseId: user.workplaceWarehouseId,
        };
      },
    }),
  ],
});
