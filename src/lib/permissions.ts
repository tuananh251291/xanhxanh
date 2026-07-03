import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";

// ADMIN/SUPER_ADMIN luôn được phép, "/dashboard" luôn được phép với mọi vai trò đã duyệt.
// Vai trò khác: tra bảng RolePermission, mặc định cho phép nếu chưa có dòng nào (fail-open).
export async function isPageAllowed(role: UserRole | null, href: string): Promise<boolean> {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  if (href === "/dashboard") return true;

  const perm = await prisma.rolePermission.findUnique({
    where: { role_href: { role, href } },
  });
  return perm?.enabled ?? true;
}
