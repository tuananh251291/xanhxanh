import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { summarizeRootingWeekGroups } from "@/lib/rooting-week-group";
import TransferFinishedForm from "./transfer-finished-form";

export default async function TransferFinishedPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/finished"))) redirect("/dashboard");

  // Thành phẩm mới nhận luôn vào Phòng khả dụng trước — Kho thành phẩm không quản lý theo giàn kệ nên
  // không cần chọn kệ, chỉ cần đúng phòng đích.
  const khaDungRoom = await prisma.room.findFirst({
    where: { type: "PHONG_KHA_DUNG", isActive: true, warehouse: { type: "THANH_PHAM", isActive: true } },
  });
  if (!khaDungRoom) {
    redirect("/dashboard");
  }

  const workplaceWarehouseId = session!.user.workplaceWarehouseId ?? null;

  // Nhóm tuần ra rễ có ít nhất 1 lô đã đến hạn chuyển kho thành phẩm (theo thời gian ra rễ riêng của mã
  // cây lô đó) — đề xuất KHO_MO chọn nhanh cả nhóm để bàn giao, thay vì quét/chọn từng kệ. Chỉ tính trong
  // đúng kho làm việc của NV (nếu đã được gán); nếu chưa gán kho thì xét toàn bộ kho sản xuất (giữ đúng
  // hành vi hiện có của phần chọn kệ thủ công bên dưới).
  const rootingRooms = await prisma.room.findMany({
    where: {
      type: "PHONG_RA_RE",
      isActive: true,
      ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
    },
    include: {
      warehouse: { select: { name: true } },
      shelves: {
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          rotationGroupId: true,
          rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
          lots: {
            where: { status: "ACTIVE" },
            select: { id: true, code: true, quantity: true, stageCode: true, enteredAt: true, expectedMoveAt: true, plantType: { select: { id: true, code: true, name: true } } },
          },
        },
      },
    },
  });

  const dueGroups = rootingRooms.flatMap((room) => {
    const statuses = summarizeRootingWeekGroups(room.shelves);
    return statuses
      .filter((s) => s.isDue)
      .map((s) => ({
        groupId: s.groupId,
        groupName: s.groupName,
        warehouseName: room.warehouse.name,
        roomName: room.name,
        oldestEnteredAt: s.oldestEnteredAt!.toISOString(),
        shelves: room.shelves
          .filter((sh) => sh.rotationGroupId === s.groupId)
          .map((sh) => ({
            id: sh.id,
            code: sh.code,
            name: sh.name,
            roomId: room.id,
            lots: sh.lots.map((l) => ({ id: l.id, code: l.code, quantity: l.quantity, stageCode: l.stageCode, plantType: l.plantType })),
          })),
      }));
  });

  return (
    <TransferFinishedForm
      khaDungRoomId={khaDungRoom.id}
      staffName={session!.user.name ?? ""}
      workplaceWarehouseId={workplaceWarehouseId}
      dueGroups={dueGroups}
    />
  );
}
