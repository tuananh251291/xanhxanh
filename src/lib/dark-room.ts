import { Prisma } from "@prisma/client";
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

  try {
    return await prisma.room.create({
      data: {
        code,
        name: staff?.name ?? "Phòng tối cá nhân",
        type: "PHONG_TOI",
        warehouseId,
        assignedStaffId: staffId,
      },
    });
  } catch (err) {
    // Race hiếm gặp: 2 request gần như đồng thời (VD Admin đổi kho làm việc đúng lúc NV lưu nhật ký
    // cấy) cùng thấy "chưa có phòng" rồi cùng tạo — request tới sau vi phạm unique trên Room.code.
    // Không coi là lỗi thật: phòng đã tồn tại (do request kia vừa tạo xong), lấy lại và trả về.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const created = await prisma.room.findFirst({ where: { warehouseId, type: "PHONG_TOI", assignedStaffId: staffId } });
      if (created) return created;
    }
    throw err;
  }
}
