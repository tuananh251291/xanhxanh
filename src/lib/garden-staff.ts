import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";

// Vườn mà người đang đăng nhập được quản lý nhân sự: Quản lý vườn = các vườn mình là managerId; Admin
// (Admin/Admin cấp cao/Admin kỹ thuật) = mọi vườn đang hoạt động. Vai trò khác = không có vườn nào.
export async function getManageableGardens(user: { id: string; role: UserRole | null | undefined }) {
  if (isAdminRole(user.role)) {
    return prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } });
  }
  if (user.role !== "NHAN_VIEN_QUAN_LY_VUON") return [];
  return prisma.productionGarden.findMany({
    where: { isActive: true, managerId: user.id },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}

export async function canManageGarden(user: { id: string; role: UserRole | null | undefined }, gardenId: string): Promise<boolean> {
  return (await getManageableGardens(user)).some((g) => g.id === gardenId);
}
