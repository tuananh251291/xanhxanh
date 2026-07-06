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
    };
  }
  interface User {
    role: UserRole | null;
    status: UserStatus;
    avatar?: string | null;
    workplaceWarehouseId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole | null;
    status: UserStatus;
    id: string;
    avatar: string | null;
    workplaceWarehouseId: string | null;
  }
}
