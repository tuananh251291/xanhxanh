import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { isGardenAdmin } from "@/types";
import { getManageableGardens } from "@/lib/garden-staff";
import GardenLayoutBoard from "./garden-layout-board";

// "Bố trí vườn" — Quản lý vườn cài đặt Nhà lưới (1,2,3…) → Giàn kệ (A,B,C…) → Dãy (1,2,3…), mã vị trí VD
// "1A1". Admin xem/sửa được mọi vườn. Xem /api/garden-layout.
export default async function GardenLayoutPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isGardenAdmin(role)) || !(await isPageAllowed(role, "/garden-layout"))) {
    redirect("/dashboard");
  }

  const gardens = await getManageableGardens(session.user);
  if (gardens.length === 0) {
    return <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>;
  }
  return <GardenLayoutBoard gardens={gardens} />;
}
