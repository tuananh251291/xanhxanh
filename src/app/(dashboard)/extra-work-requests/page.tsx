import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CalendarPlus } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ExtraWorkRequestBoard from "./extra-work-request-board";

export default async function ExtraWorkRequestsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/extra-work-requests"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarPlus className="w-6 h-6 text-primary-strong" /> Đăng ký cấy thêm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          NV cấy mô báo hoàn thành sớm chỉ định hoặc đăng ký làm thêm ngoài giờ — xác nhận/duyệt tại đây
        </p>
      </div>

      <ExtraWorkRequestBoard />
    </div>
  );
}
