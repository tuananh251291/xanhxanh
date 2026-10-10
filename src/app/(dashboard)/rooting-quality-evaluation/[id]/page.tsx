import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import RootingQualityEvaluationForm from "./rooting-quality-evaluation-form";
import { describeRootingEvaluationGroup, countRootingRotationSlots } from "@/lib/rooting-quality-evaluation";

export default async function RootingQualityEvaluationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user) redirect("/login");
  if (role !== "KY_THUAT" && !isAdminRole(role)) redirect("/dashboard");

  const { id } = await params;
  const evaluation = await prisma.rootingQualityEvaluation.findUnique({
    where: { id },
    select: {
      id: true, code: true, status: true, assignedToId: true, roomId: true, rotationGroupId: true, weekStart: true,
      warehouse: { select: { name: true } },
      room: { select: { name: true } },
      rotationGroup: { select: { name: true } },
    },
  });
  if (!evaluation) notFound();
  if (evaluation.assignedToId !== session.user.id && !isAdminRole(role)) redirect("/rooting-quality-evaluation");
  if (evaluation.status !== "PENDING") redirect("/rooting-quality-evaluation");

  const lots = await prisma.lot.findMany({
    where: { status: "ACTIVE", shelf: { rotationGroupId: evaluation.rotationGroupId, roomId: evaluation.roomId } },
    select: { quantity: true, plantTypeId: true, stageCode: true, plantType: { select: { code: true, name: true } } },
  });
  const rowMap = new Map<string, { plantTypeId: string; stageCode: string; total: number; code: string; name: string }>();
  for (const lot of lots) {
    const key = `${lot.plantTypeId}::${lot.stageCode}`;
    const row = rowMap.get(key) ?? { plantTypeId: lot.plantTypeId, stageCode: lot.stageCode, total: 0, code: lot.plantType.code, name: lot.plantType.name };
    row.total += lot.quantity;
    rowMap.set(key, row);
  }
  const rows = Array.from(rowMap.values()).sort((a, b) => a.code.localeCompare(b.code) || a.stageCode.localeCompare(b.stageCode));
  const { label, entryWeek } = describeRootingEvaluationGroup(evaluation.rotationGroup.name, evaluation.weekStart, await countRootingRotationSlots());

  return (
    <RootingQualityEvaluationForm
      evaluationId={evaluation.id}
      code={evaluation.code}
      title={`${label}${entryWeek ? ` (vào phòng ra rễ ${entryWeek})` : ""} — ${evaluation.room.name} (${evaluation.warehouse.name})`}
      rows={rows}
    />
  );
}
