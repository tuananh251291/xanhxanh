import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { isAdminRole } from "@/types";
import PlanVsActualReport from "../plan-vs-actual-report";

// Trang riêng cho NV Kỹ thuật xem báo cáo "Kế hoạch vs thực tế — cây ra rễ" — cùng 1 component/API với
// tab "Kế hoạch vs thực tế" của Admin cấp cao (xem src/app/(dashboard)/reports/page.tsx và
// src/app/api/reports/rooting-plan-vs-actual/route.ts), không giới hạn phạm vi xem theo cơ sở của chính
// NV — xem được toàn hệ thống hoặc chọn cơ sở bất kỳ, giống hệt Admin.
export default async function RootingPlanVsActualPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary-strong" /> Kế hoạch vs thực tế — cây ra rễ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          So sánh kế hoạch (nhiệm vụ tháng &quot;Dự kiến đáp ứng cây ra rễ&quot;) với sản lượng thành phẩm
          thực tế đã cấy ra — lọc theo tuần/tháng, mã cây, toàn hệ thống hoặc từng cơ sở sản xuất.
        </p>
      </div>
      <PlanVsActualReport />
    </div>
  );
}
