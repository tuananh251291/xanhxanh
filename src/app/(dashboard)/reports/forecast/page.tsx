import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isAdminRole } from "@/types";
import RootingForecastReportBoard from "../rooting-forecast/rooting-forecast-report-board";
import MotherForecastReportBoard from "../mother-forecast/mother-forecast-report-board";

// Gộp 2 mục "Dự kiến đáp ứng cây ra rễ" + "Dự kiến đáp ứng mẫu mẹ" (trước đây 2 thẻ riêng ở report-center,
// 2 trang riêng) thành 1 mục, 2 tab — dùng thẳng lại 2 board đã có (mirror cách gộp tab ở
// mother-stock-reshelf/page.tsx). Đã xoá page.tsx gốc của 2 route con (không còn truy cập trực tiếp
// được nữa), giữ nguyên API route (/api/reports/mother-forecast, /api/reports/rooting-forecast) + lib +
// workbook export vì 2 board vẫn dùng.
export default async function ForecastReportPage() {
  const session = await auth();
  if (!isAdminRole(session?.user?.role ?? null)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary-strong" /> Dự kiến đáp ứng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Bản dự kiến sản lượng 3 tháng tới mà NV Kỹ thuật từng cơ sở sản xuất đã nộp — xem cơ sở nào
          đã/chưa nộp, người nộp, đúng/trễ hạn, và tải Excel toàn bộ chi tiết.
        </p>
      </div>

      <Tabs defaultValue="rooting">
        <TabsList>
          <TabsTrigger value="rooting">Cây ra rễ</TabsTrigger>
          <TabsTrigger value="mother">Mẫu mẹ</TabsTrigger>
        </TabsList>

        <TabsContent value="rooting" className="mt-4">
          <RootingForecastReportBoard />
        </TabsContent>
        <TabsContent value="mother" className="mt-4">
          <MotherForecastReportBoard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
