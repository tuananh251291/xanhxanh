import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { canManageGarden } from "@/lib/garden-staff";
import { getRemainingByReceiptItem } from "@/lib/garden-damage";
import GardenDamageDetail from "./garden-damage-detail";

export default async function GardenDamageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const report = await prisma.gardenDamageReport.findUnique({
    where: { id },
    select: {
      id: true, code: true, flow: true, status: true, notes: true, returnReason: true, createdAt: true, submittedAt: true, confirmedAt: true,
      gardenId: true, createdById: true,
      garden: { select: { name: true } }, createdBy: { select: { name: true } }, confirmedBy: { select: { name: true } },
      receipt: { select: { id: true, code: true, createdAt: true, fromWarehouse: { select: { name: true } }, fromRoom: { select: { name: true } } } },
      items: {
        orderBy: { id: "asc" },
        select: { id: true, receiptItemId: true, stageCode: true, initialQuantity: true, reportedQuantity: true, confirmedQuantity: true, notes: true, plantType: { select: { code: true, name: true } } },
      },
      logs: { orderBy: { at: "asc" }, select: { id: true, action: true, detail: true, at: true, by: { select: { name: true } } } },
    },
  });
  if (!report) notFound();

  const canManage = await canManageGarden(session.user, report.gardenId);
  const isCreator = report.createdById === session.user.id;
  if (!isCreator && !canManage && !isAdminRole(session.user.role)) redirect("/garden-damage");

  // Số còn ghi hỏng được của từng dòng (thực nhận − đã ghi hỏng ở phiếu khác) — gợi ý giới hạn khi nhập.
  const remaining = await getRemainingByReceiptItem(report.items.map((i) => i.receiptItemId), report.id);

  return (
    <GardenDamageDetail
      report={{
        ...report,
        createdAt: report.createdAt.toISOString(),
        submittedAt: report.submittedAt?.toISOString() ?? null,
        confirmedAt: report.confirmedAt?.toISOString() ?? null,
        receipt: { ...report.receipt, createdAt: report.receipt.createdAt.toISOString() },
        items: report.items.map((i) => ({ ...i, remaining: remaining.get(i.receiptItemId) ?? 0 })),
        logs: report.logs.map((l) => ({ ...l, at: l.at.toISOString() })),
      }}
      canEdit={isCreator && (report.status === "DRAFT" || report.status === "RETURNED")}
      canReview={canManage && report.status === "SUBMITTED"}
    />
  );
}
