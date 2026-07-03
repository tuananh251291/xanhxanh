import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { startOfWeek, endOfWeek } from "date-fns";
import { isPageAllowed } from "@/lib/permissions";
import MediumTaskBoard, { type MediumTask } from "./medium-task-board";

export default async function MediumTasksPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/medium/tasks"))) redirect("/dashboard");

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });

  // Mỗi dòng quy cách nguồn (M3/M5) trong 1 chỉ định có thể cần 2 môi trường riêng: 1 để nhân thêm
  // mẫu mẹ (số lượng = quantity đưa vào), 1 để ra rễ thành cây thành phẩm (số lượng = expectedFinishedOutput).
  const items = await prisma.plantingInstructionItem.findMany({
    where: {
      instruction: {
        status: { in: ["DRAFT", "ACTIVE"] },
        OR: [
          { weekStart: { gte: weekStart, lte: weekEnd } },
          { weekStart: null, createdAt: { gte: weekStart, lte: weekEnd } },
        ],
      },
    },
    include: {
      instruction: {
        select: {
          id: true,
          code: true,
          status: true,
          plantType: { select: { name: true } },
          assignedToId: true,
          assignedTo: { select: { name: true } },
        },
      },
      motherMedium: { select: { id: true, code: true, name: true } },
      finishedMedium: { select: { id: true, code: true, name: true } },
    },
  });

  const tasks: MediumTask[] = [];
  for (const item of items) {
    const base = {
      instructionId: item.instruction.id,
      instructionCode: item.instruction.code,
      plantTypeName: item.instruction.plantType.name,
      assignedToId: item.instruction.assignedToId,
      assignedToName: item.instruction.assignedTo?.name ?? null,
      status: item.instruction.status,
      stageCode: item.stageCode,
    };
    if (item.motherMedium) {
      tasks.push({
        key: `${item.id}-MOTHER`,
        ...base,
        purpose: "MOTHER",
        quantity: item.quantity,
        mediumTypeId: item.motherMedium.id,
        mediumCode: item.motherMedium.code,
        mediumName: item.motherMedium.name,
      });
    }
    if (item.finishedMedium && item.expectedFinishedOutput) {
      tasks.push({
        key: `${item.id}-FINISHED`,
        ...base,
        purpose: "FINISHED",
        quantity: item.expectedFinishedOutput,
        mediumTypeId: item.finishedMedium.id,
        mediumCode: item.finishedMedium.code,
        mediumName: item.finishedMedium.name,
      });
    }
  }

  return <MediumTaskBoard tasks={tasks} />;
}
