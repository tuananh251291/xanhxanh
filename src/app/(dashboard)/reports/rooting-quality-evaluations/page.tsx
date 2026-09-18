import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { isAdminRole } from "@/types";
import RootingQualityEvaluationReportBoard from "./rooting-quality-evaluation-report-board";

// Báo cáo lịch sử "Đánh giá chất lượng cây ra rễ" cho Admin/Admin cấp cao/Admin kỹ thuật + NV Kỹ
// thuật/Kho mô — xem GET /api/rooting-quality-evaluations (đã tự lọc theo đúng kho/người phụ trách cho
// vai trò không phải Admin).
export default async function RootingQualityEvaluationsReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Báo cáo đánh giá chất lượng cây ra rễ
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tỉ lệ đạt/không đạt cây ra rễ hàng tuần do NV kỹ thuật đánh giá trước khi Kho mô bàn giao sang Kho thành phẩm, kèm lý do giải thích.
        </p>
      </div>
      <RootingQualityEvaluationReportBoard />
    </div>
  );
}
