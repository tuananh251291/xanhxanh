import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { isAdminRole } from "@/types";
import MotherForecastReportBoard from "./mother-forecast-report-board";

// Trang Admin xem "Dự kiến đáp ứng mẫu mẹ" mọi cơ sở sản xuất đã nộp — xem
// src/app/api/reports/mother-forecast/route.ts. NV Kỹ thuật tự nộp/xem đúng cơ sở mình tại
// /mother-forecast, KHÔNG dùng trang này.
export default async function MotherForecastReportPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary-strong" /> Dự kiến đáp ứng mẫu mẹ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Bản dự kiến sản lượng mẫu mẹ 3 tháng tới mà NV Kỹ thuật từng cơ sở sản xuất đã nộp — xem cơ sở
          nào đã/chưa nộp, người nộp, đúng/trễ hạn, và tải Excel toàn bộ chi tiết.
        </p>
      </div>
      <MotherForecastReportBoard />
    </div>
  );
}
