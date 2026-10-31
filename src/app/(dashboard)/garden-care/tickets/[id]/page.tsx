import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isGardenAdmin } from "@/types";
import { canManageGarden } from "@/lib/garden-staff";
import { getCareStaffProfile, rowLabel } from "@/lib/garden-care";
import GardenCareTicketDetail from "./garden-care-ticket-detail";

const rowSelect = { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } as const;

export default async function GardenCareTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const t = await prisma.gardenCareTicket.findUnique({
    where: { id },
    select: {
      id: true, code: true, type: true, status: true, notes: true, returnReason: true, createdAt: true, submittedAt: true, confirmedAt: true,
      gardenId: true, lotId: true, createdById: true,
      garden: { select: { name: true } }, staff: { select: { name: true } }, createdBy: { select: { name: true } }, confirmedBy: { select: { name: true } },
      lot: {
        select: {
          code: true, pool: true, stageCode: true, initialQuantity: true, staffId: true, plantType: { select: { code: true, name: true } },
          receiptItem: { select: { receipt: { select: { id: true, code: true } } } },
        },
      },
      items: { orderBy: { id: "asc" }, select: { id: true, rowId: true, lineId: true, line: { select: { quantity: true } }, reportedQuantity: true, confirmedQuantity: true, notes: true, row: { select: rowSelect }, fromRow: { select: rowSelect } } },
      logs: { orderBy: { at: "asc" }, select: { id: true, action: true, detail: true, at: true, by: { select: { name: true } } } },
    },
  });
  if (!t) notFound();

  const canManage = await canManageGarden(session.user, t.gardenId);
  const profile = session.user.role === "NV_CHAM_SOC_CAY_MO" ? await getCareStaffProfile(session.user.id) : null;
  const isCreator = t.createdById === session.user.id;
  if (!isCreator && !canManage && !isGardenAdmin(session.user.role) && !(profile && profile.id === t.lot.staffId)) redirect("/garden-care");

  return (
    <GardenCareTicketDetail
      ticket={{
        ...t,
        createdAt: t.createdAt.toISOString(),
        submittedAt: t.submittedAt?.toISOString() ?? null,
        confirmedAt: t.confirmedAt?.toISOString() ?? null,
        items: t.items.map((i) => ({
          id: i.id, reportedQuantity: i.reportedQuantity, confirmedQuantity: i.confirmedQuantity, notes: i.notes,
          rowLabel: rowLabel(i.row), fromRowLabel: i.fromRow ? rowLabel(i.fromRow) : null, available: i.line?.quantity ?? 0,
        })),
        logs: t.logs.map((l) => ({ ...l, at: l.at.toISOString() })),
      }}
      canEdit={t.type !== "PLACE" && isCreator && (t.status === "DRAFT" || t.status === "RETURNED")}
      canReview={t.type !== "PLACE" && canManage && t.status === "SUBMITTED"}
    />
  );
}
