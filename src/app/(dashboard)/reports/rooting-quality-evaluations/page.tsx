import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { isAdminRole } from "@/types";
import RootingQualityEvaluationReportBoard from "./rooting-quality-evaluation-report-board";

// Báo cáo lịch sử "Đánh giá chất lượng cây ra rễ" cho Admin/Admin cấp cao/Admin kỹ thuật + NV Kỹ
// thuật/Kho mô + Quản lý kho TP (xem lượng hàng đạt sẽ về Kho TP theo tuần) — xem GET
// /api/rooting-quality-evaluations (đã tự lọc theo đúng kho/người phụ trách cho vai trò không phải Admin).
export default async function RootingQualityEvaluationsReportPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!isAdminRole(role) && role !== "KY_THUAT" && role !== "KHO_MO" && role !== "QUAN_LY_KHO_THANH_PHAM") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" />{" "}
          {role === "QUAN_LY_KHO_THANH_PHAM" || role === "KHO_MO" ? "Dự kiến hàng ra rễ về Kho TP" : "Báo cáo đánh giá chất lượng cây ra rễ"}
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tỉ lệ đạt/không đạt cây ra rễ hàng tuần do NV kỹ thuật đánh giá trước khi Kho mô bàn giao sang Kho thành phẩm, kèm lý do giải thích. Số đạt là lượng hàng từ khu sản xuất sẽ gửi đến Kho Thành Phẩm trong tuần giao tương ứng.
        </p>
      </div>
      <RootingQualityEvaluationReportBoard />
    </div>
  );
}
