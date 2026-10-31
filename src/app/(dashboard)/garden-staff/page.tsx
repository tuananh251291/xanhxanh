import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isGardenAdmin } from "@/types";
import { getManageableGardens } from "@/lib/garden-staff";
import { prisma } from "@/lib/prisma";
import GardenStaffBoard from "./garden-staff-board";

// "Nhân sự vườn" — Quản lý vườn cài đặt nhân viên làm việc tại vườn mình (không có tài khoản đăng nhập), mỗi
// người tích 1 hoặc nhiều vị trí. Admin xem/sửa được mọi vườn. Xem /api/garden-staff.
export default async function GardenStaffPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isGardenAdmin(role)) || !(await isPageAllowed(role, "/garden-staff"))) {
    redirect("/dashboard");
  }

  const gardens = await getManageableGardens(session.user);
  if (gardens.length === 0) {
    return <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>;
  }
  // Tài khoản NV chăm sóc cây mô (tạo ở trang Người dùng) để liên kết vào hồ sơ — kèm hồ sơ đang gắn (nếu có).
  const accounts = await prisma.user.findMany({
    where: { role: "NV_CHAM_SOC_CAY_MO", isActive: true },
    select: { id: true, code: true, name: true, gardenStaffProfile: { select: { id: true, isActive: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <GardenStaffBoard
      gardens={gardens}
      accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, linkedStaffId: a.gardenStaffProfile?.isActive ? a.gardenStaffProfile.id : null }))}
    />
  );
}
