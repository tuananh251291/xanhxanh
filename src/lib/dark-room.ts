import { prisma } from "@/lib/prisma";

// Phòng tối cá nhân của NV cấy mô — không quản lý theo giàn kệ như Phòng mẫu mẹ (không hàng/cột/sức
// chứa/loại cây), chỉ cần 1 "kệ" đại diện duy nhất/NV để Lot có chỗ gắn (Lot.shelfId) ngay khi cấy
// xong, bên trong Room "Phòng tối" đã seed sẵn theo từng kho sản xuất. Tái dùng assignedStaffId đúng
// như cơ chế kệ "đã chia" ở Phòng mẫu mẹ.
export async function getOrCreatePersonalDarkRoomShelf(staffId: string, warehouseId: string) {
  const darkRoom = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_TOI" } });
  if (!darkRoom) throw new Error("Kho sản xuất này chưa có Phòng tối — SUPER_ADMIN cần tạo phòng trước");

  const existing = await prisma.shelf.findFirst({ where: { roomId: darkRoom.id, assignedStaffId: staffId } });
  if (existing) return existing;

  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { code: true, name: true } });
  return prisma.shelf.create({
    data: {
      code: `${darkRoom.code}-${staff?.code ?? staffId.slice(0, 6)}`,
      name: staff?.name ?? "Phòng tối cá nhân",
      warehouseId,
      roomId: darkRoom.id,
      assignedStaffId: staffId,
    },
  });
}
