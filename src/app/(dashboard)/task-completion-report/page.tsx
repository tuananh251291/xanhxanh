import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CalendarX } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import TaskCompletionReportBoard from "./task-completion-report-board";

export default async function TaskCompletionReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/task-completion-report")) || !(isAdminRole(role) || role === "KHO_MO")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarX className="w-6 h-6 text-primary-strong" /> Số ngày không hoàn thành nhiệm vụ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Theo dõi số ngày NV kỹ thuật, NV cấy mô, NV kho mô không hoàn thành nhiệm vụ theo tuần.
        </p>
      </div>
      <TaskCompletionReportBoard isAdmin={isAdminRole(role)} />
    </div>
  );
}
