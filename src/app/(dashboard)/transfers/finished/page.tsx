import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import { getRootingGroupsForHandoff } from "./rooting-groups";
import TransferFinishedForm from "./transfer-finished-form";

export default async function TransferFinishedPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/transfers/finished"))) redirect("/dashboard");

  // Thành phẩm mới nhận luôn vào Phòng đạt tiêu chuẩn trước — Kho thành phẩm không quản lý theo giàn kệ nên
  // không cần chọn kệ, chỉ cần đúng phòng đích. Trang này không tự bàn giao gì cả (mọi luồng bàn giao đều
  // dẫn sang /transfers/finished/review hoặc /early) nhưng vẫn chặn sớm nếu kho thành phẩm chưa có Phòng
  // đạt tiêu chuẩn nào — tránh dẫn NV vào 1 luồng chắc chắn sẽ lỗi ở bước sau.
  const khaDungRoom = await prisma.room.findFirst({
    where: { type: "PHONG_DAT_TIEU_CHUAN", isActive: true, warehouse: { type: "THANH_PHAM", isActive: true } },
  });
  if (!khaDungRoom) {
    redirect("/dashboard");
  }

  const workplaceWarehouseId = session!.user.workplaceWarehouseId ?? null;

  // Chỉ dùng ở đây để hiện thẻ cảnh báo Nhóm ĐÃ đến hạn (isDue=true) — trang riêng "Bàn giao sớm theo
  // Nhóm tuần ra rễ" (/transfers/finished/early) tự tra lại toàn bộ Nhóm (kể cả chưa đến hạn) khi cần.
  const rootingGroups = await getRootingGroupsForHandoff(workplaceWarehouseId);

  return <TransferFinishedForm rootingGroups={rootingGroups} />;
}
