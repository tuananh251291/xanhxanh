import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { isAdminRole } from "@/types";
import InstructionPlanVsActualReport from "../instruction-plan-vs-actual-report";

// Trang riêng ở Trung tâm báo cáo (/report-center) — tách khỏi tab của reports/page.tsx để tránh xung đột
// chỉnh sửa đồng thời, cùng lý do đã áp dụng cho planting-log-summary/production-capacity (xem comment ở
// report-center/page.tsx). Dùng chung component/API với báo cáo gốc — xem
// src/app/api/reports/instruction-plan-vs-actual/route.ts.
export default async function InstructionPlanVsActualPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" /> Dữ liệu chỉ định cấy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          So sánh số kỳ vọng lúc tạo chỉ định với số thực tế NV cấy mô đã cấy ra — lọc theo khu sản xuất,
          mã cây, mã chỉ định, theo tháng hoặc toàn bộ thời gian.
        </p>
      </div>
      <InstructionPlanVsActualReport />
    </div>
  );
}
