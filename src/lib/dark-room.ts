import { prisma } from "@/lib/prisma";

// Phòng tối cá nhân của NV cấy mô — không quản lý theo giàn kệ như Phòng mẫu mẹ, mỗi NV có 1 Room
// riêng (type PHONG_TOI, assignedStaffId = NV đó) để Lot gắn thẳng vào (Lot.roomId) ngay khi cấy xong.
// Idempotent: gọi lại nhiều lần cho cùng 1 NV/kho chỉ trả về đúng 1 Room đã có.
export async function getOrCreatePersonalDarkRoom(staffId: string, warehouseId: string) {
  const existing = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_TOI", assignedStaffId: staffId } });
  if (existing) return existing;

  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { code: true, name: true } });
  const warehouse = await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
  const code = `${warehouse?.code ?? warehouseId.slice(0, 6)}-PT-${staff?.code ?? staffId.slice(0, 6)}`;

  return prisma.room.create({
    data: {
      code,
      name: staff?.name ?? "Phòng tối cá nhân",
      type: "PHONG_TOI",
      warehouseId,
      assignedStaffId: staffId,
    },
  });
}
