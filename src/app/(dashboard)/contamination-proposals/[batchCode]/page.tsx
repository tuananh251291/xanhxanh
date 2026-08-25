import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, isKhoThanhPhamRole } from "@/types";
import BatchDetailBoard from "./batch-detail-board";

export default async function ContaminationProposalBatchPage({
  params,
}: {
  params: Promise<{ batchCode: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/contamination-proposals"))) redirect("/dashboard");
  if (role !== "KHO_MO" && !isAdminRole(role) && !isKhoThanhPhamRole(role)) redirect("/dashboard");

  const { batchCode } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> Chi tiết đề xuất
        </h1>
      </div>
      <BatchDetailBoard
        batchCode={batchCode}
        canSubmit={role === "KHO_MO" || isKhoThanhPhamRole(role)}
        canApprove={isAdminRole(role)}
        currentUserId={session?.user?.id}
        currentUserRole={role}
        currentUserWarehouseId={session?.user?.workplaceWarehouseId}
      />
    </div>
  );
}
