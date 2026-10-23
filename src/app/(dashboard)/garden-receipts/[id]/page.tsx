import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageGarden } from "@/lib/garden-staff";
import { canViewGardenReceipt } from "@/lib/garden-receipt";
import GardenReceiptDetail from "./garden-receipt-detail";

export default async function GardenReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const receipt = await prisma.gardenReceipt.findUnique({
    where: { id },
    select: {
      id: true, code: true, status: true, notes: true, createdAt: true, countRound: true, countedAt: true, approvedAt: true, completedAt: true, assignedAt: true,
      gardenId: true, fromWarehouseId: true,
      garden: { select: { name: true, managerId: true } },
      fromWarehouse: { select: { name: true } }, fromRoom: { select: { name: true } },
      createdBy: { select: { name: true } }, countedBy: { select: { name: true } }, approvedBy: { select: { name: true } },
      assignedUser: { select: { name: true } }, assignedStaff: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        select: { id: true, stageCode: true, quantity: true, firstReceivedQuantity: true, receivedQuantity: true, plantType: { select: { code: true, name: true } } },
      },
    },
  });
  if (!receipt) notFound();
  if (!(await canViewGardenReceipt(session.user, receipt))) redirect("/garden-receipts");

  const canManage = await canManageGarden(session.user, receipt.gardenId);
  const sorters = canManage
    ? await prisma.gardenStaff.findMany({ where: { gardenId: receipt.gardenId, isActive: true, types: { has: "PHAN_LOAI" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <GardenReceiptDetail
      receipt={{
        ...receipt,
        createdAt: receipt.createdAt.toISOString(),
        countedAt: receipt.countedAt?.toISOString() ?? null,
        approvedAt: receipt.approvedAt?.toISOString() ?? null,
        completedAt: receipt.completedAt?.toISOString() ?? null,
        assignedAt: receipt.assignedAt?.toISOString() ?? null,
        assigneeName: receipt.assignedStaff ? `${receipt.assignedStaff.name} (NV phân loại)` : receipt.assignedUser ? `${receipt.assignedUser.name} (Quản lý vườn)` : null,
      }}
      canManage={canManage}
      canApprove={session.user.role === "SUPER_ADMIN"}
      sorters={sorters}
    />
  );
}
