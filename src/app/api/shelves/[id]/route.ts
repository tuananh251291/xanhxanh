import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

// plantTypeId/assignedStaffId chỉ có ý nghĩa với kệ trong Phòng mẫu mẹ (SUPER_ADMIN cấu hình).
// roomId (chuyển kệ giữa Phòng mẫu mẹ ↔ Phòng ra rễ, hoặc phòng khác cùng kho) — Admin thường cũng được.
// sharedMotherPool/allowedCodes chỉ áp dụng cho kệ "chung" (assignedStaffId null) trong Phòng mẫu mẹ.
// weekSlot chỉ áp dụng cho kệ Phòng ra rễ (SUPER_ADMIN cấu hình) — xem rooting-week-group.ts.
const patchSchema = z.object({
  plantTypeId: z.string().nullable().optional(),
  assignedStaffId: z.string().nullable().optional(),
  roomId: z.string().optional(),
  sharedMotherPool: z.enum(["QUA_HAN", "DUNG_HAN"]).nullable().optional(),
  weekSlot: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable().optional(),
  allowedCodes: z.array(z.string().trim().min(1)).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { plantTypeId, assignedStaffId, roomId, sharedMotherPool, weekSlot, allowedCodes } = parsed.data;

  const changesPlantOrStaff = plantTypeId !== undefined || assignedStaffId !== undefined;
  if (changesPlantOrStaff && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được gán mã cây/nhân viên cho kệ" }, { status: 403 });
  }
  if (sharedMotherPool !== undefined && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được phân loại Kho quá hạn/đúng hạn" }, { status: 403 });
  }
  if (weekSlot !== undefined && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được gán Nhóm tuần ra rễ cho kệ" }, { status: 403 });
  }
  if (allowedCodes !== undefined && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được cấu hình Cho phép xếp" }, { status: 403 });
  }
  if (roomId !== undefined && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (
    !changesPlantOrStaff &&
    roomId === undefined &&
    sharedMotherPool === undefined &&
    weekSlot === undefined &&
    allowedCodes === undefined
  ) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  if (weekSlot !== undefined) {
    const shelf = await prisma.shelf.findUnique({ where: { id }, select: { room: { select: { type: true } } } });
    if (!shelf) return NextResponse.json({ message: "Không tìm thấy kệ" }, { status: 404 });
    const targetRoomType = roomId !== undefined
      ? (await prisma.room.findUnique({ where: { id: roomId }, select: { type: true } }))?.type
      : shelf.room?.type;
    if (targetRoomType !== "PHONG_RA_RE") {
      return NextResponse.json({ message: "Nhóm tuần ra rễ chỉ áp dụng cho kệ Phòng ra rễ" }, { status: 400 });
    }
  }

  if (sharedMotherPool || allowedCodes !== undefined) {
    const shelf = await prisma.shelf.findUnique({ where: { id }, select: { assignedStaffId: true } });
    if (!shelf) return NextResponse.json({ message: "Không tìm thấy kệ" }, { status: 404 });
    const willBeAssigned = assignedStaffId !== undefined ? !!assignedStaffId : !!shelf.assignedStaffId;
    if (willBeAssigned && sharedMotherPool) {
      return NextResponse.json({ message: "Chỉ kệ chung (chưa gán nhân viên) mới phân loại Kho quá hạn/đúng hạn được" }, { status: 400 });
    }
    if (willBeAssigned && allowedCodes !== undefined) {
      return NextResponse.json({ message: "Chỉ kệ chung (chưa gán nhân viên) mới cấu hình được Cho phép xếp" }, { status: 400 });
    }
  }

  const data: {
    plantTypeId?: string | null;
    assignedStaffId?: string | null;
    roomId?: string;
    sharedMotherPool?: "QUA_HAN" | "DUNG_HAN" | null;
    weekSlot?: number | null;
    allowedCodes?: string[];
  } = {};
  if (sharedMotherPool !== undefined) data.sharedMotherPool = sharedMotherPool;
  if (weekSlot !== undefined) data.weekSlot = weekSlot;
  if (allowedCodes !== undefined) data.allowedCodes = allowedCodes;

  if (roomId !== undefined) {
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { type: true } });
    if (!room) return NextResponse.json({ message: "Không tìm thấy phòng đích" }, { status: 400 });
    data.roomId = roomId;
    // Rời khỏi Phòng mẫu mẹ thì mã cây/nhân viên không còn ý nghĩa — bỏ gán.
    if (room.type !== "PHONG_MAU_ME") {
      data.plantTypeId = null;
      data.assignedStaffId = null;
    }
    // Rời khỏi Phòng ra rễ thì Nhóm tuần ra rễ không còn ý nghĩa — bỏ gán.
    if (room.type !== "PHONG_RA_RE" && data.weekSlot === undefined) {
      data.weekSlot = null;
    }
    // Rời khỏi Phòng mẫu mẹ thì Cho phép xếp không còn ý nghĩa — bỏ gán.
    if (room.type !== "PHONG_MAU_ME" && data.allowedCodes === undefined) {
      data.allowedCodes = [];
    }
  }

  if (assignedStaffId !== undefined && data.assignedStaffId === undefined) {
    if (assignedStaffId) {
      const staff = await prisma.user.findUnique({ where: { id: assignedStaffId }, select: { role: true, workplaceWarehouseId: true } });
      if (!staff || staff.role !== "CAY_MO") {
        return NextResponse.json({ message: "Chỉ được gán nhân viên cấy mô (CAY_MO)" }, { status: 400 });
      }
      // NV cấy mô chỉ làm việc với đúng 1 kho sản xuất — không được gán kệ ngoài kho đã chỉ định.
      if (staff.workplaceWarehouseId) {
        const shelf = await prisma.shelf.findUnique({ where: { id }, select: { warehouseId: true } });
        if (shelf && shelf.warehouseId !== staff.workplaceWarehouseId) {
          return NextResponse.json(
            { message: "Nhân viên cấy mô này đã được gán địa điểm làm việc ở kho khác — không thể gán kệ ngoài kho đó" },
            { status: 400 }
          );
        }
      }
      // Kệ chuyển từ "chung" sang "đã chia" thì không còn thuộc Kho quá hạn/đúng hạn nữa, cũng không
      // còn cấu hình Cho phép xếp.
      data.sharedMotherPool = null;
      if (data.allowedCodes === undefined) data.allowedCodes = [];
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

// Xóa giàn kệ — chỉ Admin cấp cao. Xóa mềm (isActive: false). Client đã hỏi xác nhận kèm cảnh báo nếu
// kệ đang có lô cây (dữ liệu shelf.lots đã có sẵn phía client, xem ShelfTable) trước khi gọi API này —
// vẫn cho xóa dù còn lô, vì Lot.shelfId là quan hệ optional nên không mất dữ liệu lô, chỉ ẩn kệ khỏi
// danh sách đang hoạt động.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được xóa giàn kệ" }, { status: 403 });
  }

  const { id } = await params;
  const shelf = await prisma.shelf.findUnique({ where: { id } });
  if (!shelf) return NextResponse.json({ message: "Không tìm thấy kệ" }, { status: 404 });

  await prisma.shelf.update({ where: { id }, data: { isActive: false } });

  return NextResponse.json({ success: true });
}
