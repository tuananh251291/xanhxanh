import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isPageAllowed } from "@/lib/permissions";
import { isAttendanceHr } from "@/lib/attendance-server";
import TimesheetBoard from "./timesheet-board";
import SitesBoard from "./sites-board";
import LeaveBalanceBoard from "./leave-balance-board";

// Bảng chấm công — NV Hành chính nhân sự (và Admin cao nhất): xem bảng công, cài ca/vị trí từng khu, quỹ phép.
export default async function AttendanceManagePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAttendanceHr(role) || !(await isPageAllowed(role, "/attendance/manage"))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarCheck className="w-6 h-6 text-primary-strong" /> Bảng chấm công
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Chấm công của NV Kho mô, Cấy mô, Kỹ thuật, Kho thành phẩm — GPS + ảnh selfie (ảnh tự xoá sau 30 ngày).
        </p>
      </div>
      <Tabs defaultValue="timesheet">
        <TabsList>
          <TabsTrigger value="timesheet">Bảng công</TabsTrigger>
          <TabsTrigger value="sites">Cài đặt khu & ca làm</TabsTrigger>
          <TabsTrigger value="leave">Quỹ phép năm</TabsTrigger>
        </TabsList>
        <TabsContent value="timesheet" className="mt-4"><TimesheetBoard /></TabsContent>
        <TabsContent value="sites" className="mt-4"><SitesBoard /></TabsContent>
        <TabsContent value="leave" className="mt-4"><LeaveBalanceBoard /></TabsContent>
      </Tabs>
    </div>
  );
}
