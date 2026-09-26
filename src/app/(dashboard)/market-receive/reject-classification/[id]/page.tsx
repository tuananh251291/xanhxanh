import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import RejectClassificationDetailBoard from "./reject-classification-detail-board";

export default async function RejectClassificationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const classification = await prisma.rejectedGoodsClassification.findUnique({
    where: { id },
    select: { warehouseId: true },
  });
  if (!classification) redirect("/dashboard");

  const role = session.user.role;
  const isOwnerPartner = role === "DOI_TAC_VAN_HANH" && session.user.workplaceWarehouseId === classification.warehouseId;
  let isSaleApprover = false;
  if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findUnique({
      where: { userId_warehouseId: { userId: session.user.id, warehouseId: classification.warehouseId } },
    });
    isSaleApprover = !!access;
  }
  const isAdmin = isAdminRole(role);

  if (!isOwnerPartner && !isSaleApprover && !isAdmin) redirect("/dashboard");

  // Duyệt Huỷ/Trồng CHỈ thuộc về NV bán hàng phụ trách kho đó (RetailWarehouseAccess) — Admin xem được
  // (isAdmin vẫn qua được guard ở trên để theo dõi) nhưng KHÔNG còn duyệt thay được nữa, tránh chồng chéo
  // trách nhiệm với Sale (xem permission khớp ở PATCH /api/reject-classifications/[id]).
  return <RejectClassificationDetailBoard id={id} canSubmit={isOwnerPartner || isAdmin} canApprove={isSaleApprover} />;
}
