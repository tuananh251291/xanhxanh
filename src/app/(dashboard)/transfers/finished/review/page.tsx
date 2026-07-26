import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { isPageAllowed } from "@/lib/permissions";
import ReviewTransferForm from "./review-transfer-form";

// Màn hình xem trước & bàn giao — đích đến của 2 nút "Xem trước & bàn giao cả nhóm" (Nhóm đã đến hạn) và
// "Xem trước & bàn giao ... kệ đã chọn" (xem trước theo Nhóm tuần ra rễ bất kỳ) ở TransferFinishedForm,
// tách thành 1 trang riêng (thay vì bảng dòng gọn trong cùng trang) để dễ nhìn hơn khi bàn giao nhiều kệ
// cùng lúc — chỉ nhận danh sách kệ qua shelfIds trên URL, tự tra lại dữ liệu kệ ở server, không mang theo
// state của trang /transfers/finished.
export default async function TransferFinishedReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ shelfIds?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  // Dùng chung quyền với trang cha "/transfers/finished" — đây chỉ là 1 bước xem trước trong đúng luồng
  // đó, không cần Admin cấu hình quyền riêng cho URL con này.
  if (!(await isPageAllowed(role, "/transfers/finished"))) redirect("/dashboard");

  const sp = await searchParams;
  const shelfIds = Array.from(new Set((sp.shelfIds ?? "").split(",").map((id) => id.trim()).filter(Boolean)));
  if (shelfIds.length === 0) redirect("/transfers/finished");

  const khaDungRoom = await prisma.room.findFirst({
    where: { type: "PHONG_DAT_TIEU_CHUAN", isActive: true, warehouse: { type: "THANH_PHAM", isActive: true } },
  });
  if (!khaDungRoom) redirect("/dashboard");

  const workplaceWarehouseId = session!.user.workplaceWarehouseId ?? null;

  // Chỉ tra những kệ thật sự thuộc Phòng ra rễ đang hoạt động, và nếu NV đã được gán kho làm việc thì chỉ
  // lấy kệ trong đúng kho đó — chặn NV tự chế URL với id kệ của kho khác. Kệ không hợp lệ/không thuộc
  // quyền bị lặng lẽ bỏ qua, không báo lỗi riêng cho từng id.
  const shelves = await prisma.shelf.findMany({
    where: {
      id: { in: shelfIds },
      isActive: true,
      room: {
        type: "PHONG_RA_RE",
        isActive: true,
        ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
      },
    },
    select: {
      id: true,
      code: true,
      name: true,
      roomId: true,
      lots: {
        where: { status: "ACTIVE" },
        select: { id: true, code: true, quantity: true, stageCode: true, plantType: { select: { id: true, code: true, name: true } } },
      },
    },
  });
  if (shelves.length === 0) redirect("/transfers/finished");

  return (
    <ReviewTransferForm
      khaDungRoomId={khaDungRoom.id}
      staffName={session!.user.name ?? ""}
      // where đã lọc room.type = PHONG_RA_RE nên roomId chắc chắn có giá trị — Prisma vẫn suy ra kiểu
      // nullable vì đó là quan hệ tùy chọn ở model Shelf nói chung.
      shelves={shelves.map((s) => ({ ...s, roomId: s.roomId! }))}
    />
  );
}
