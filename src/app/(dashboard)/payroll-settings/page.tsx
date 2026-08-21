import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { canManagePayroll } from "@/types";
import StaffBaseSalaryBoard from "./staff-base-salary-board";
import PublicHolidaysBoard from "./public-holidays-board";
import KpiBonusRateBoard from "./kpi-bonus-rate-board";
import PlantTypeKpiRateBoard from "./plant-type-kpi-rate-board";
import StaffKpiDailyRateBoard from "./staff-kpi-daily-rate-board";
import PayrollOtherBonusBoard from "./payroll-other-bonus-board";
import RecoveryBehaviorTypesBoard from "./recovery-behavior-types-board";
import ComplianceRecoveryBoard from "./compliance-recovery-board";

// Hub nhập liệu cho tính năng tính lương NV cấy mô — chỉ SUPER_ADMIN/NV Hành chính nhân sự (xem
// canManagePayroll). Kết quả tính lương xem ở /reports/payroll ("Bảng lương") — trang này chỉ nhập tham
// số. Mọi tab tính SỐNG (không đóng băng/chốt sổ) từ giá trị đang nhập ở đây, xem
// src/lib/payroll-calculation.ts.
export default async function PayrollSettingsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canManagePayroll(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings2 className="w-6 h-6 text-primary-strong" /> Cài đặt lương
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Các bảng tham số dùng tính lương NV cấy mô — xem kết quả đã tính ở trang &quot;Bảng lương&quot;.
        </p>
      </div>

      <Tabs defaultValue="base-salary">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="base-salary" className="whitespace-nowrap">Lương công việc</TabsTrigger>
            <TabsTrigger value="holidays" className="whitespace-nowrap">Ngày nghỉ lễ</TabsTrigger>
            <TabsTrigger value="kpi-bonus" className="whitespace-nowrap">Mức thưởng KPI</TabsTrigger>
            <TabsTrigger value="plant-kpi" className="whitespace-nowrap">Quy đổi sản lượng-KPI</TabsTrigger>
            <TabsTrigger value="staff-kpi" className="whitespace-nowrap">KPI của nhân viên</TabsTrigger>
            <TabsTrigger value="other-bonus" className="whitespace-nowrap">Khoản thưởng khác</TabsTrigger>
            <TabsTrigger value="recovery-behaviors" className="whitespace-nowrap">Cài đặt điểm phục hồi</TabsTrigger>
            <TabsTrigger value="recovery" className="whitespace-nowrap">Điểm phục hồi</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="base-salary" className="mt-4"><StaffBaseSalaryBoard /></TabsContent>
        <TabsContent value="holidays" className="mt-4"><PublicHolidaysBoard /></TabsContent>
        <TabsContent value="kpi-bonus" className="mt-4"><KpiBonusRateBoard /></TabsContent>
        <TabsContent value="plant-kpi" className="mt-4"><PlantTypeKpiRateBoard /></TabsContent>
        <TabsContent value="staff-kpi" className="mt-4"><StaffKpiDailyRateBoard /></TabsContent>
        <TabsContent value="other-bonus" className="mt-4"><PayrollOtherBonusBoard /></TabsContent>
        <TabsContent value="recovery-behaviors" className="mt-4"><RecoveryBehaviorTypesBoard /></TabsContent>
        <TabsContent value="recovery" className="mt-4"><ComplianceRecoveryBoard /></TabsContent>
      </Tabs>
    </div>
  );
}
