import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sprout } from "lucide-react";
import { isAdminRole } from "@/types";
import RootingForecastReportBoard from "./rooting-forecast-report-board";

// Trang Admin xem "Dự kiến đáp ứng cây ra rễ" mọi cơ sở sản xuất đã nộp — mirror
// src/app/(dashboard)/reports/mother-forecast/page.tsx. NV Kỹ thuật tự nộp/xem đúng cơ sở mình tại
// /rooting-forecast, KHÔNG dùng trang này.
export default async function RootingForecastReportPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sprout className="w-6 h-6 text-primary-strong" /> Dự kiến đáp ứng cây ra rễ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Bản dự kiến sản lượng cây ra rễ 3 tháng tới mà NV Kỹ thuật từng cơ sở sản xuất đã nộp — xem cơ
          sở nào đã/chưa nộp, người nộp, đúng/trễ hạn, và tải Excel toàn bộ chi tiết.
        </p>
      </div>
      <RootingForecastReportBoard />
    </div>
  );
}
