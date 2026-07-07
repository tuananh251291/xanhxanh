import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole } from "@/types";
import ContaminationProposalBoard from "./contamination-proposal-board";

export default async function ContaminationProposalsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/contamination-proposals"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role)) redirect("/dashboard");

  const canSubmit = role === "KHO_MO";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Đề xuất Trồng/Hủy hàng nhiễm
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {canSubmit
            ? "Đề xuất trồng lại hoặc hủy bỏ số lượng đang lưu ở Phòng nhiễm — gửi Admin duyệt"
            : "Duyệt các đề xuất Trồng/Hủy hàng nhiễm do Kho mô gửi lên"}
        </p>
      </div>

      <ContaminationProposalBoard canSubmit={canSubmit} canApprove={isAdminRole(role)} />
    </div>
  );
}
