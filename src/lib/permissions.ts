import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import type { UserRole } from "@prisma/client";

// Ngoại lệ theo từng tài khoản (ma trận phân quyền chỉ theo vai trò): trang đơn hàng đang tắt cho cả vai trò NV bán hàng,
// riêng tài khoản test gắn Kho TP TEST vẫn được tự lên đơn để kiểm thử.
const ORDER_PAGE_EXCEPTION_EMAILS = new Set(["test.sale@xanhxanh.vn"]);
const ORDER_PAGE_HREFS = new Set(["/orders", "/orders/create", "/orders/list"]);
export function hasOrderPageException(email: string | null | undefined, href: string): boolean {
  return !!email && ORDER_PAGE_EXCEPTION_EMAILS.has(email) && ORDER_PAGE_HREFS.has(href);
}

// ADMIN/SUPER_ADMIN luôn được phép, "/dashboard" và "/account" luôn được phép với mọi vai trò đã duyệt
// (trang tài khoản cá nhân — đổi mật khẩu/ảnh đại diện — không thể bị Admin tắt qua ma trận phân quyền).
// Vai trò khác: tra bảng RolePermission, mặc định cho phép nếu chưa có dòng nào (fail-open).
// email: chỉ trang đơn hàng truyền, để xét ngoại lệ theo tài khoản ở trên.
export async function isPageAllowed(role: UserRole | null, href: string, email?: string | null): Promise<boolean> {
  if (!role) return false;
  if (isAdminRole(role)) return true;
  if (href === "/dashboard" || href === "/account") return true;
  if (hasOrderPageException(email, href)) return true;

  const perm = await prisma.rolePermission.findUnique({
    where: { role_href: { role, href } },
  });
  return perm?.enabled ?? true;
}
