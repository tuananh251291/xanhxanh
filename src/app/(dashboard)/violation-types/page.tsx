import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ViolationTypesBoard from "./violation-types-board";

const ALLOWED_ROLES = ["KHO_MO", "KY_THUAT", "HANH_CHINH_NHAN_SU"] as const;

export default async function ViolationTypesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/violation-types")) || !(isAdminRole(role) || ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number]))) {
    redirect("/dashboard");
  }
  // Chỉ Admin/Admin cấp cao thêm được loại lỗi mới — NV kho mô/kỹ thuật/hành chính nhân sự chỉ xem/chọn
  // để ghi nhận, không còn tự thêm mới (danh mục lỗi quản lý tập trung), xem POST /api/violation-types.
  const canCreate = isAdminRole(role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" /> Danh sách lỗi vi phạm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Các loại lỗi vi phạm dùng để chọn khi ghi nhận trong nhiệm vụ &quot;Kiểm tra kho tối&quot;, hoặc
          ghi trực tiếp cho 1 NV cấy mô bất kỳ.
        </p>
      </div>
      <ViolationTypesBoard canCreate={canCreate} />
    </div>
  );
}
