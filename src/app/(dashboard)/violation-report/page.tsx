import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ViolationReportBoard from "./violation-report-board";

export default async function ViolationReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/violation-report")) || !(isAdminRole(role) || role === "KHO_MO")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Báo cáo vi phạm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Số lỗi vi phạm mỗi NV cấy mô bị ghi nhận khi Kho mô &quot;Kiểm tra kho tối&quot; — mặc định xem
          tháng hiện tại, có thể lọc theo khoảng thời gian khác.
        </p>
      </div>
      <ViolationReportBoard />
    </div>
  );
}
