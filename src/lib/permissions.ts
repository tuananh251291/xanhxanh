import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";

// ADMIN/SUPER_ADMIN luôn được phép, "/dashboard" và "/account" luôn được phép với mọi vai trò đã duyệt
// (trang tài khoản cá nhân — đổi mật khẩu/ảnh đại diện — không thể bị Admin tắt qua ma trận phân quyền).
// Vai trò khác: tra bảng RolePermission, mặc định cho phép nếu chưa có dòng nào (fail-open).
export async function isPageAllowed(role: UserRole | null, href: string): Promise<boolean> {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  if (href === "/dashboard" || href === "/account") return true;

  const perm = await prisma.rolePermission.findUnique({
    where: { role_href: { role, href } },
  });
  return perm?.enabled ?? true;
}
