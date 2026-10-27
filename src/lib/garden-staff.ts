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

// Kiểm tra tài khoản liên kết cho 1 hồ sơ nhân sự vườn: chỉ khi có vị trí Chăm sóc cây mô, tài khoản phải là
// NV_CHAM_SOC_CAY_MO đang hoạt động và chưa gắn cho hồ sơ khác. Trả về userId hợp lệ (null = không liên kết)
// hoặc thông báo lỗi.
export async function resolveStaffUserLink(
  userId: string | undefined,
  types: string[],
  staffId: string | null
): Promise<{ userId: string | null } | { error: string }> {
  if (!userId) return { userId: null };
  if (!types.includes("CHAM_SOC_CAY_MO")) return { error: "Chỉ NV có vị trí Chăm sóc cây mô mới liên kết tài khoản đăng nhập" };
  const user = await prisma.user.findFirst({
    where: { id: userId, role: "NV_CHAM_SOC_CAY_MO", isActive: true },
    select: { id: true, gardenStaffProfile: { select: { id: true, isActive: true } } },
  });
  if (!user) return { error: "Tài khoản không hợp lệ (cần vai trò NV Chăm sóc cây mô)" };
  if (user.gardenStaffProfile && user.gardenStaffProfile.id !== staffId && user.gardenStaffProfile.isActive) {
    return { error: "Tài khoản này đã liên kết với nhân viên khác" };
  }
  return { userId: user.id };
}
