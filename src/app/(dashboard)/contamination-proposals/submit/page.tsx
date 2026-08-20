import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import ContaminationDraftSubmit from "@/components/shared/contamination-draft-submit";

// Nhiệm vụ tuần "Gửi đề xuất Trồng/Hủy" của Kho mô — chỉ để rà lại phiếu chung đã "Gộp phiếu" (từ nhiều
// NV cấy mô/nhiều ngày, xem dark-room-check/contamination-personal-board.tsx) rồi gửi Admin duyệt; gộp
// thêm dòng mới vẫn làm ở mục "Kiểm tra kho nhiễm cá nhân" trong Nhiệm vụ ngày.
export default async function ContaminationProposalSubmitPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/contamination-proposals/submit")) || role !== "KHO_MO") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Send className="w-6 h-6 text-primary-strong" /> Gửi đề xuất Trồng/Hủy
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Rà lại phiếu chung đã gộp từ &quot;Kiểm tra kho nhiễm cá nhân&quot; rồi gửi Admin duyệt.
        </p>
      </div>
      <ContaminationDraftSubmit defaultExpanded />
    </div>
  );
}
