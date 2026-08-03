import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { randomUUID } from "crypto";
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
        token.holdDays = (user as { holdDays?: number | null }).holdDays ?? null;
        token.sessionId = (user as { sessionId?: string }).sessionId;
        token.sessionRevoked = false;
        return token;
      }
      // Làm mới role/status/isActive/avatar/workplaceWarehouseId/holdDays/currentSessionId từ DB mỗi
      // request, để Admin duyệt/đổi vai trò/khóa tài khoản/đổi địa điểm làm việc/năng lực giữ đơn có
      // hiệu lực ngay mà không cần đăng xuất — ĐỒNG THỜI cũng là lúc phát hiện phiên này đã bị 1 lần
      // đăng nhập MỚI HƠN (thiết bị/trình duyệt khác) ghi đè currentSessionId (xem authorize() bên
      // dưới) — không xóa token, chỉ đánh dấu sessionRevoked để layout.tsx tự đăng xuất và báo rõ lý do
      // (khác hẳn "tài khoản bị từ chối" của status REJECTED, không nên lẫn 2 khái niệm).
      if (token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, status: true, isActive: true, avatar: true, workplaceWarehouseId: true, holdDays: true, currentSessionId: true },
        });
        if (!dbUser || !dbUser.isActive) {
          token.status = "REJECTED";
        } else {
          token.role = dbUser.role;
          token.status = dbUser.status;
          token.avatar = dbUser.avatar;
          token.workplaceWarehouseId = dbUser.workplaceWarehouseId;
          token.holdDays = dbUser.holdDays;
          token.sessionRevoked = !!token.sessionId && dbUser.currentSessionId !== token.sessionId;
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

        // Đăng nhập thành công — tạo phiên MỚI, tự động vô hiệu phiên đang hoạt động (nếu có, VD đang mở
        // ở thiết bị/trình duyệt khác) vì chỉ cho phép 1 phiên/tài khoản (xem comment ở jwt() bên trên và
        // User.currentSessionId). Gộp chung 1 lệnh update với việc reset failedLoginAttempts phía dưới.
        const sessionId = randomUUID();
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, currentSessionId: sessionId },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          avatar: user.avatar,
          workplaceWarehouseId: user.workplaceWarehouseId,
          holdDays: user.holdDays,
          sessionId,
        };
      },
    }),
  ],
});
