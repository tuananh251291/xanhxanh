import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
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

  return (
    <TransferFinishedForm
      khaDungRoomId={khaDungRoom.id}
      staffName={session!.user.name ?? ""}
      workplaceWarehouseId={session!.user.workplaceWarehouseId ?? null}
    />
  );
}
