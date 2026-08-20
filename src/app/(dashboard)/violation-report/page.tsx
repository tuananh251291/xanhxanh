import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, canManagePayroll } from "@/types";
import ViolationReportBoard from "./violation-report-board";
import DataCorrectionsBoard from "../data-corrections/data-corrections-board";
import ViolationTypesBoard from "../violation-types/violation-types-board";
import TaskCompletionReportBoard from "../task-completion-report/task-completion-report-board";

// Gộp menu Kho mô — "Theo dõi nhập sai dữ liệu cấy", "Danh sách lỗi vi phạm", "Số ngày không hoàn thành
// nhiệm vụ" gộp làm tab tại đây cho menu dọc gọn hơn (xem ROLE_NAV.KHO_MO, src/types/index.ts). 3 URL cũ
// (/data-corrections, /violation-types, /task-completion-report) vẫn hoạt động độc lập như cũ, dùng
// thẳng lại các Board đã tự fetch, không cần tách gì thêm.
// NV Hành chính nhân sự (chủ yếu chỉ xem — riêng vi phạm được ghi trực tiếp/sửa/xoá vì phục vụ tính
// lương, xem canManagePayroll) thấy 3/4 tab: "Báo cáo vi phạm", "Danh sách lỗi vi phạm" (dùng để ghi
// nhận vi phạm trực tiếp cho NV cấy mô — xem record-violation-dialog.tsx), "Số ngày không hoàn thành
// nhiệm vụ" — ẩn riêng "Theo dõi nhập sai dữ liệu cấy" (không thuộc phạm vi được giao).
export default async function ViolationReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  const isHr = role === "HANH_CHINH_NHAN_SU";
  if (!(await isPageAllowed(role, "/violation-report")) || !(isAdminRole(role) || role === "KHO_MO" || isHr)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Báo cáo vi phạm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Vi phạm, nhập sai dữ liệu cấy và nhiệm vụ không hoàn thành của NV cấy mô/kỹ thuật/kho mô.
        </p>
      </div>

      <Tabs defaultValue="violation-report">
        <TabsList>
          <TabsTrigger value="violation-report">Báo cáo vi phạm</TabsTrigger>
          {!isHr && <TabsTrigger value="data-corrections">Theo dõi nhập sai dữ liệu cấy</TabsTrigger>}
          <TabsTrigger value="violation-types">Danh sách lỗi vi phạm</TabsTrigger>
          <TabsTrigger value="task-completion">Số ngày không hoàn thành nhiệm vụ</TabsTrigger>
        </TabsList>

        <TabsContent value="violation-report" className="mt-4">
          <ViolationReportBoard canFilterByWarehouse={isAdminRole(role) || isHr} canManage={canManagePayroll(role)} />
        </TabsContent>
        {!isHr && (
          <TabsContent value="data-corrections" className="mt-4">
            <DataCorrectionsBoard canFilterByWarehouse={isAdminRole(role)} />
          </TabsContent>
        )}
        <TabsContent value="violation-types" className="mt-4">
          <ViolationTypesBoard />
        </TabsContent>
        <TabsContent value="task-completion" className="mt-4">
          <TaskCompletionReportBoard isAdmin={isAdminRole(role)} canFilterByWarehouse={isAdminRole(role) || isHr} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
