import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ViolationReportBoard from "./violation-report-board";
import DataCorrectionsBoard from "../data-corrections/data-corrections-board";
import ViolationTypesBoard from "../violation-types/violation-types-board";
import TaskCompletionReportBoard from "../task-completion-report/task-completion-report-board";

// Gộp menu Kho mô — "Theo dõi nhập sai dữ liệu cấy", "Danh sách lỗi vi phạm", "Số ngày không hoàn thành
// nhiệm vụ" gộp làm tab tại đây cho menu dọc gọn hơn (xem ROLE_NAV.KHO_MO, src/types/index.ts). 3 URL cũ
// (/data-corrections, /violation-types, /task-completion-report) vẫn hoạt động độc lập như cũ, dùng
// thẳng lại các Board đã tự fetch, không cần tách gì thêm.
// NV Hành chính nhân sự (chỉ xem, không thao tác nghiệp vụ) chỉ thấy đúng 2 tab được giao: "Báo cáo vi
// phạm" + "Số ngày không hoàn thành nhiệm vụ" — ẩn "Theo dõi nhập sai dữ liệu cấy" (không thuộc phạm vi
// được giao) và "Danh sách lỗi vi phạm" (board này luôn hiện nút "Thêm mới" bất kể role xem, không tự ẩn
// theo quyền — API POST chỉ Admin/KHO_MO nên NV HCNS bấm sẽ chỉ gặp lỗi 403, không nên cho thấy nút đó).
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
          {!isHr && <TabsTrigger value="violation-types">Danh sách lỗi vi phạm</TabsTrigger>}
          <TabsTrigger value="task-completion">Số ngày không hoàn thành nhiệm vụ</TabsTrigger>
        </TabsList>

        <TabsContent value="violation-report" className="mt-4">
          <ViolationReportBoard />
        </TabsContent>
        {!isHr && (
          <TabsContent value="data-corrections" className="mt-4">
            <DataCorrectionsBoard />
          </TabsContent>
        )}
        {!isHr && (
          <TabsContent value="violation-types" className="mt-4">
            <ViolationTypesBoard />
          </TabsContent>
        )}
        <TabsContent value="task-completion" className="mt-4">
          <TaskCompletionReportBoard isAdmin={isAdminRole(role)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
