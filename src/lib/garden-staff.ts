import type { Prisma, UserRole } from "@prisma/client";
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

// Gắn tài khoản NV chăm sóc cây mô vào 1 Vườn sản xuất (từ trang Người dùng — tạo/sửa tài khoản): hồ sơ Nhân sự
// vườn đang liên kết tài khoản này được chuyển sang vườn mới (thêm vị trí Chăm sóc cây mô nếu thiếu), chưa có thì
// tự tạo hồ sơ (tên = tên tài khoản, vị trí Chăm sóc cây mô). gardenId null = gỡ khỏi vườn (giữ hồ sơ, chỉ bỏ liên
// kết tài khoản). Hồ sơ là nơi DUY NHẤT lưu "NV thuộc vườn nào" (xem getCareStaffGarden).
export async function assignCareStaffGarden(
  tx: Prisma.TransactionClient,
  params: { userId: string; userName: string; gardenId: string | null; actorId: string }
): Promise<void> {
  const { userId, userName, gardenId, actorId } = params;
  const profile = await tx.gardenStaff.findUnique({ where: { userId }, select: { id: true, isActive: true, types: true } });
  if (!gardenId) {
    if (profile) await tx.gardenStaff.update({ where: { id: profile.id }, data: { userId: null } });
    return;
  }
  if (profile && profile.isActive) {
    await tx.gardenStaff.update({
      where: { id: profile.id },
      data: { gardenId, ...(profile.types.includes("CHAM_SOC_CAY_MO") ? {} : { types: [...profile.types, "CHAM_SOC_CAY_MO"] }) },
    });
    return;
  }
  // Hồ sơ cũ đã xoá (ẩn) còn giữ tài khoản — gỡ để tạo hồ sơ mới.
  if (profile) await tx.gardenStaff.update({ where: { id: profile.id }, data: { userId: null } });
  await tx.gardenStaff.create({ data: { gardenId, name: userName, types: ["CHAM_SOC_CAY_MO"], userId, createdById: actorId } });
}
