import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  // Xem page.tsx cùng thư mục cha — Sale (isRetailManager) duyệt được đề xuất do Đối tác vận hành gửi
  // cho (các) kho được gán qua RetailWarehouseAccess.
  let isSaleRetailManager = false;
  if (role === "SALE") {
    const user = await prisma.user.findUnique({ where: { id: session!.user!.id }, select: { isRetailManager: true } });
    isSaleRetailManager = !!user?.isRetailManager;
  }
  if (role !== "KHO_MO" && !isAdminRole(role) && !isKhoThanhPhamRole(role) && role !== "DOI_TAC_VAN_HANH" && !isSaleRetailManager) redirect("/dashboard");

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
        canSubmit={role === "KHO_MO" || isKhoThanhPhamRole(role) || role === "DOI_TAC_VAN_HANH"}
        canApprove={isAdminRole(role) || isSaleRetailManager}
        currentUserId={session?.user?.id}
        currentUserRole={role}
        currentUserWarehouseId={session?.user?.workplaceWarehouseId}
      />
    </div>
  );
}
