import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminRole } from "@/types";
import { ClipboardCheck } from "lucide-react";
import ProbationEvaluationBoard from "./probation-evaluation-board";

// Danh sách "Đánh giá thử việc" — NV cấy mô thấy phiếu của chính mình (mọi trạng thái), NV Kỹ thuật thấy
// phiếu đang chờ mình chấm (đúng khu sản xuất mình làm việc) — xem GET /api/probation-evaluations (đã tự
// lọc theo vai trò).
export default async function ProbationEvaluationsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (role !== "CAY_MO" && role !== "KY_THUAT" && !isAdminRole(role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Đánh giá thử việc
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {role === "CAY_MO"
            ? "Sau mỗi tuần thử việc, tự chấm điểm rồi gửi NV kỹ thuật chấm lại."
            : "Chấm điểm lại các phiếu NV cấy mô thử việc đã tự chấm, đúng khu sản xuất bạn phụ trách."}
        </p>
      </div>
      <ProbationEvaluationBoard />
    </div>
  );
}
