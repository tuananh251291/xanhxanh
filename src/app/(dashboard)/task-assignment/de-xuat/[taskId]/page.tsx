import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { isAdminRole } from "@/types";
import { WEEKLY_CHECK_ROOM_TYPES } from "@/lib/finished-goods";
import { MARKET_ROOM_TYPES } from "@/lib/market-inspection";
import { getDeXuatDeadline } from "@/lib/daily-task-weekly";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import DeXuatExecuteForm from "./de-xuat-execute-form";

export default async function DeXuatExecutePage({ params }: { params: Promise<{ taskId: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user) redirect("/login");

  const { taskId } = await params;
  const task = await prisma.dailyTask.findUnique({
    where: { id: taskId },
    select: {
      id: true, code: true, type: true, status: true, roomId: true, assignedToId: true, weekStart: true,
      title: true, plantCategoryCodes: true,
      _count: { select: { proposals: { where: { status: { not: "DRAFT" } } } } },
    },
  });
  if (!task || task.type !== "DE_XUAT_TRONG_HUY") notFound();

  const isManager = role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role);
  if (task.assignedToId !== session.user.id && !isManager) redirect("/task-assignment");
  // Đã gửi đề xuất rồi (dù Admin chưa duyệt) thì không cho thực hiện lại — xem chặn tương ứng ở
  // POST /api/contamination-proposals.
  if (task.status !== "PENDING" || task._count.proposals > 0) redirect("/task-assignment");

  // Đối tác vận hành ở Kho thị trường có 3 phòng cố định KHÁC HẲN 4 loại phòng Kho thành phẩm — và không
  // chọn Vườn sản xuất cho đề xuất Trồng (gardens rỗng, xem POST /api/contamination-proposals nhánh
  // isMarketPartner) vì kho thị trường không gắn với 1 Vườn sản xuất cụ thể nào.
  const isMarketPartner = role === "DOI_TAC_VAN_HANH";
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  const [rooms, gardens] = await Promise.all([
    workplaceWarehouseId
      ? prisma.room.findMany({
          where: { warehouseId: workplaceWarehouseId, type: { in: isMarketPartner ? MARKET_ROOM_TYPES : WEEKLY_CHECK_ROOM_TYPES }, isActive: true },
          select: { id: true, name: true, type: true },
          orderBy: { type: "asc" },
        })
      : [],
    // Kho thành phẩm không còn chọn Vườn ở đây — NV chỉ chuyển hàng không đạt về Phòng chờ xử lý, Quản lý
    // kho thành phẩm mới đề xuất Trồng (chọn Vườn) ở nhiệm vụ tuần của mình.
    Promise.resolve([] as { id: string; code: string; name: string }[]),
  ]);

  const deadlineLabel = task.weekStart
    ? `Hạn hoàn thành: ${format(getDeXuatDeadline(task.weekStart), "dd/MM/yyyy", { locale: vi })} (Thứ Sáu)`
    : null;

  // Việc "Kiểm tra kho cây <Loại>" (không có roomId cụ thể — khác việc "kho thị trường", vốn đã gắn sẵn 1
  // Phòng thị trường) mặc định kiểm tra Phòng đạt tiêu chuẩn — phòng chính chứa tồn thành phẩm theo loại
  // cây, NV vẫn đổi được sang phòng khác trong dropdown nếu cần.
  const standardRoom = rooms.find((r) => r.type === "PHONG_DAT_TIEU_CHUAN");
  const defaultRoomId = task.roomId ?? standardRoom?.id ?? null;

  return (
    <DeXuatExecuteForm
      taskId={task.id}
      taskCode={task.code}
      taskTitle={task.title ?? task.code}
      deadlineLabel={deadlineLabel}
      rooms={rooms}
      gardens={gardens}
      initialRoomId={defaultRoomId}
      roomLocked={isMarketPartner && !!task.roomId && rooms.some((r) => r.id === task.roomId)}
      plantCategoryCodes={task.plantCategoryCodes}
      isMarketPartner={isMarketPartner}
    />
  );
}
