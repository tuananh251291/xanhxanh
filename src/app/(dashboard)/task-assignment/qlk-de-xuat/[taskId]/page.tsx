import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { isAdminRole } from "@/types";
import { getDeXuatDeadline, qlkSlotOf } from "@/lib/daily-task-weekly";
import { getManagerWeeklyData } from "@/lib/finished-goods-weekly";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import QlkDeXuatForm from "./qlk-de-xuat-form";
import QlkProcessingForm from "./qlk-processing-form";

// 1 trong 3 việc tuần của Quản lý kho thành phẩm (QLK_DE_XUAT_TUAN — Đề xuất hủy / Đề xuất trồng / Phiếu xử
// lý theo slotKey, xem QLK_WEEKLY_SLOTS) — xem POST /api/finished-goods-weekly/[taskId].
export default async function QlkDeXuatPage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user) redirect("/login");
  if (role !== "QUAN_LY_KHO_THANH_PHAM" && !isAdminRole(role)) redirect("/dashboard");

  const { taskId } = await params;
  const task = await prisma.dailyTask.findUnique({
    where: { id: taskId },
    select: { id: true, code: true, type: true, status: true, title: true, weekStart: true, warehouseId: true, slotKey: true },
  });
  if (!task || task.type !== "QLK_DE_XUAT_TUAN" || !task.warehouseId) notFound();
  if (role === "QUAN_LY_KHO_THANH_PHAM" && task.warehouseId !== session.user.workplaceWarehouseId) redirect("/task-assignment");
  if (task.status !== "PENDING") redirect("/task-assignment");

  const slot = qlkSlotOf(task.slotKey);
  const data = await getManagerWeeklyData(task.warehouseId);
  const deadlineLabel = task.weekStart
    ? `Gửi trong ngày Thứ Sáu ${format(getDeXuatDeadline(task.weekStart), "dd/MM/yyyy", { locale: vi })}`
    : null;
  const common = {
    taskId: task.id,
    taskCode: task.code,
    taskTitle: task.title ?? task.code,
    deadlineLabel,
    hasProcessingRoom: !!data.processingRoom,
  };

  if (slot === "qlk-xu-ly") {
    return <QlkProcessingForm {...common} processingStock={data.processingStock} productionWarehouses={data.productionWarehouses} />;
  }
  return (
    <QlkDeXuatForm
      {...common}
      mode={slot === "qlk-trong" ? "trong" : "huy"}
      destroyGroups={data.destroyGroups}
      processingStock={data.processingStock}
      gardens={data.gardens}
    />
  );
}
