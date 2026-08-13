import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ViolationTypesBoard from "./violation-types-board";

export default async function ViolationTypesPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/violation-types")) || !(isAdminRole(role) || role === "KHO_MO")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" /> Danh sách lỗi vi phạm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Các loại lỗi vi phạm dùng để chọn khi ghi nhận trong nhiệm vụ &quot;Kiểm tra kho tối&quot; — NV
          kho mô có thể tự thêm loại mới ngay tại đây.
        </p>
      </div>
      <ViolationTypesBoard />
    </div>
  );
}
