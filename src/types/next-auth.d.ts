import type { UserRole, UserStatus } from "@prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole | null;
      status: UserStatus;
      avatar: string | null;
      workplaceWarehouseId: string | null;
      holdDays: number | null;
      // true = phiên này đã bị 1 lần đăng nhập MỚI HƠN (thiết bị/trình duyệt khác) thay thế — chỉ 1
      // phiên/tài khoản được hoạt động cùng lúc, xem User.currentSessionId + comment ở auth.ts.
      sessionRevoked: boolean;
    };
  }
  interface User {
    role: UserRole | null;
    status: UserStatus;
    avatar?: string | null;
    workplaceWarehouseId?: string | null;
    holdDays?: number | null;
    // ID phiên vừa tạo lúc đăng nhập (authorize()) — gán vào token.sessionId ngay sau đó.
    sessionId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole | null;
    status: UserStatus;
    id: string;
    avatar: string | null;
    workplaceWarehouseId: string | null;
    holdDays: number | null;
    sessionId?: string;
    sessionRevoked?: boolean;
  }
}
