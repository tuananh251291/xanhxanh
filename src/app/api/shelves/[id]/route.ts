import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

// plantTypeId/assignedStaffId chỉ có ý nghĩa với kệ trong Phòng mẫu mẹ (SUPER_ADMIN cấu hình).
// roomId (chuyển kệ giữa Phòng mẫu mẹ ↔ Phòng ra rễ, hoặc phòng khác cùng kho) — Admin thường cũng được.
const patchSchema = z.object({
  plantTypeId: z.string().nullable().optional(),
  assignedStaffId: z.string().nullable().optional(),
  roomId: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { plantTypeId, assignedStaffId, roomId } = parsed.data;

  const changesPlantOrStaff = plantTypeId !== undefined || assignedStaffId !== undefined;
  if (changesPlantOrStaff && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được gán mã cây/nhân viên cho kệ" }, { status: 403 });
  }
  if (roomId !== undefined && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (!changesPlantOrStaff && roomId === undefined) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  const data: { plantTypeId?: string | null; assignedStaffId?: string | null; roomId?: string } = {};

  if (roomId !== undefined) {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { type: true } });
    if (!room) return NextResponse.json({ message: "Không tìm thấy phòng đích" }, { status: 400 });
    data.roomId = roomId;
    // Rời khỏi Phòng mẫu mẹ thì mã cây/nhân viên không còn ý nghĩa — bỏ gán.
    if (room.type !== "PHONG_MAU_ME") {
      data.plantTypeId = null;
      data.assignedStaffId = null;
    }
  }

  if (assignedStaffId !== undefined && data.assignedStaffId === undefined) {
    if (assignedStaffId) {
      const staff = await prisma.user.findUnique({ where: { id: assignedStaffId }, select: { role: true } });
      if (!staff || staff.role !== "CAY_MO") {
        return NextResponse.json({ message: "Chỉ được gán nhân viên cấy mô (CAY_MO)" }, { status: 400 });
      }
    }
    data.assignedStaffId = assignedStaffId;
  }

  if (plantTypeId !== undefined && data.plantTypeId === undefined) {
    // Đổi loại cây khi kệ đang còn lô của loại cây khác thì sẽ gây nhầm lẫn — chặn lại.
    if (plantTypeId) {
      const mismatched = await prisma.lot.count({
        where: { shelfId: id, status: "ACTIVE", plantTypeId: { not: plantTypeId } },
      });
      if (mismatched > 0) {
        return NextResponse.json({ message: "Kệ đang có lô của loại cây khác — chuyển/xử lý hết lô cũ trước khi đổi" }, { status: 409 });
      }
    }
    data.plantTypeId = plantTypeId;
  }

  const shelf = await prisma.shelf.update({
    where: { id },
    data,
    include: {
      plantType: { select: { code: true, name: true } },
      assignedStaff: { select: { code: true, name: true } },
      room: { select: { type: true, name: true } },
    },
  });

  return NextResponse.json(shelf);
}
