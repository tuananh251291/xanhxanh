import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldAlert } from "lucide-react";
import { isAdminRole } from "@/types";
import DataCorrectionsBoard from "../data-corrections/data-corrections-board";
import ViolationReportBoard from "../violation-report/violation-report-board";
import TaskCompletionReportBoard from "../task-completion-report/task-completion-report-board";

// Gộp menu Admin — KHÔNG đụng menu KHO_MO, 2 trang này vẫn hiện riêng trong ROLE_NAV của KHO_MO như cũ
// (ngoài phạm vi lần này, chỉ gộp menu Admin).
export default async function QualityMonitoringPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary-strong" /> Giám sát & vi phạm
        </h1>
        <p className="text-text-secondary text-sm mt-1">Theo dõi nhập sai dữ liệu cấy, báo cáo vi phạm.</p>
      </div>

      <Tabs defaultValue="data-corrections">
        <TabsList>
          <TabsTrigger value="data-corrections">Theo dõi nhập sai dữ liệu cấy</TabsTrigger>
          <TabsTrigger value="violation-report">Báo cáo vi phạm</TabsTrigger>
          <TabsTrigger value="task-completion">Số ngày không hoàn thành nhiệm vụ</TabsTrigger>
        </TabsList>

        <TabsContent value="data-corrections" className="mt-4">
          <DataCorrectionsBoard canFilterByWarehouse />
        </TabsContent>
        <TabsContent value="violation-report" className="mt-4">
          <ViolationReportBoard canFilterByWarehouse />
        </TabsContent>
        <TabsContent value="task-completion" className="mt-4">
          <TaskCompletionReportBoard isAdmin canFilterByWarehouse />
        </TabsContent>
      </Tabs>
    </div>
  );
}
