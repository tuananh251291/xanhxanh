import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { isAdminRole } from "@/types";
import { FINISHED_GOODS_ROOM_TYPES } from "@/lib/finished-goods";
import { formatDeXuatTaskTitle } from "@/lib/daily-task-weekly";
import DeXuatExecuteForm from "./de-xuat-execute-form";

export default async function DeXuatExecutePage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user) redirect("/login");

  const { taskId } = await params;
  const task = await prisma.dailyTask.findUnique({
    where: { id: taskId },
    select: { id: true, code: true, type: true, status: true, roomId: true, assignedToId: true, weekStart: true },
  });
  if (!task || task.type !== "DE_XUAT_TRONG_HUY") notFound();

  const isManager = role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role);
  if (task.assignedToId !== session.user.id && !isManager) redirect("/task-assignment");
  if (task.status !== "PENDING") redirect("/task-assignment");

  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  const [rooms, gardens] = await Promise.all([
    workplaceWarehouseId
      ? prisma.room.findMany({
          where: { warehouseId: workplaceWarehouseId, type: { in: FINISHED_GOODS_ROOM_TYPES }, isActive: true },
          select: { id: true, name: true, type: true },
          orderBy: { type: "asc" },
        })
      : [],
    prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <DeXuatExecuteForm
      taskId={task.id}
      taskCode={task.code}
      taskTitle={task.weekStart ? formatDeXuatTaskTitle(task.weekStart) : task.code}
      rooms={rooms}
      gardens={gardens}
      initialRoomId={task.roomId}
    />
  );
}
