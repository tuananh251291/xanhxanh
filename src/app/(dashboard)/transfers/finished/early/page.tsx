import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { getRootingGroupsForHandoff } from "../rooting-groups";
import EarlyHandoffForm from "./early-handoff-form";

// "Bàn giao sớm theo Nhóm tuần ra rễ" — trang riêng (thay vì UI xem trước gọn trong
// TransferFinishedForm) để chọn 1 kệ bất kỳ (kể cả Nhóm CHƯA đến hạn), xem toàn bộ kệ + số lượng theo
// quy cách của cả Nhóm tuần ra rễ chứa kệ đó, và tự nhập "Số đạt xuất" muốn bàn giao trước cho từng kệ
// (không bắt buộc lấy hết nguyên kệ).
export default async function EarlyHandoffPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Dùng chung quyền với trang cha "/transfers/finished".
  if (!(await isPageAllowed(role, "/transfers/finished"))) redirect("/dashboard");

  const khaDungRoom = await prisma.room.findFirst({
    where: { type: "PHONG_DAT_TIEU_CHUAN", isActive: true, warehouse: { type: "THANH_PHAM", isActive: true } },
  });
  if (!khaDungRoom) redirect("/dashboard");

  const workplaceWarehouseId = session!.user.workplaceWarehouseId ?? null;

  const [rootingGroups, rooms] = await Promise.all([
    getRootingGroupsForHandoff(workplaceWarehouseId),
    prisma.room.findMany({
      where: {
        type: "PHONG_RA_RE",
        isActive: true,
        ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
      },
      select: {
        name: true,
        warehouse: { select: { name: true } },
        shelves: { where: { isActive: true }, select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  const pickableShelves = rooms.flatMap((room) =>
    room.shelves.map((s) => ({ id: s.id, code: s.code, name: s.name, warehouseName: room.warehouse.name, roomName: room.name }))
  );

  return (
    <EarlyHandoffForm
      khaDungRoomId={khaDungRoom.id}
      staffName={session!.user.name ?? ""}
      pickableShelves={pickableShelves}
      rootingGroups={rootingGroups}
    />
  );
}
