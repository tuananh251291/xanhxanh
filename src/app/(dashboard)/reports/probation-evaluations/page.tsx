import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { isAdminRole } from "@/types";
import ProbationEvaluationReportBoard from "./probation-evaluation-report-board";

// Báo cáo "Đánh giá thử việc" cho Hành chính nhân sự + Admin — xem GET /api/probation-evaluations (Admin
// và HANH_CHINH_NHAN_SU thấy tất cả NV, không lọc theo kho).
export default async function ProbationEvaluationsReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "HANH_CHINH_NHAN_SU") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Báo cáo đánh giá thử việc
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Kết quả đánh giá 9 tuần thử việc của từng NV cấy mô, chấm bởi NV kỹ thuật.
        </p>
      </div>
      <ProbationEvaluationReportBoard />
    </div>
  );
}
