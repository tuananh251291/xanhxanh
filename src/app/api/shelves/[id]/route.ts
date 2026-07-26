import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";
import { resolveShelfAttributeUpdate } from "@/lib/shelf-attribute-update";

// plantTypeId/assignedStaffId chỉ có ý nghĩa với kệ trong Phòng mẫu mẹ (SUPER_ADMIN cấu hình).
// roomId (chuyển kệ giữa Phòng mẫu mẹ ↔ Phòng ra rễ, hoặc phòng khác cùng kho) — Admin thường cũng được.
// sharedMotherPool/allowedCodes chỉ áp dụng cho kệ "chung" (assignedStaffId null) trong Phòng mẫu mẹ.
// Nhóm tuần ra rễ/Nhóm tuần mẫu mẹ (rotationGroupId) KHÔNG sửa ở đây nữa — SUPER_ADMIN gán kệ vào Nhóm
// qua /settings/shelf-groups (xem /api/shelf-groups/[id]/shelves), route này chỉ tự bỏ gán khi chuyển
// kệ sang phòng khác loại.
// capacity (Phòng mẫu mẹ tính theo cụm, Phòng ra rễ tính theo cây) — SUPER_ADMIN sửa lại sau khi tạo
// kệ, null = không giới hạn.
const patchSchema = z.object({
  plantTypeId: z.string().nullable().optional(),
  assignedStaffId: z.string().nullable().optional(),
  roomId: z.string().optional(),
  sharedMotherPool: z.enum(["QUA_HAN", "DUNG_HAN"]).nullable().optional(),
  allowedCodes: z.array(z.string().trim().min(1)).optional(),
  capacity: z.number().int().positive().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role;
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { plantTypeId, assignedStaffId, roomId, sharedMotherPool, allowedCodes, capacity } = parsed.data;

  const changesPlantOrStaff = plantTypeId !== undefined || assignedStaffId !== undefined;
  if (changesPlantOrStaff && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được gán mã cây/nhân viên cho kệ" }, { status: 403 });
  }
  if (sharedMotherPool !== undefined && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được phân loại Kho quá hạn/đúng hạn" }, { status: 403 });
  }
  if (allowedCodes !== undefined && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được cấu hình Cho phép xếp" }, { status: 403 });
  }
  if (capacity !== undefined && role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cao nhất mới được sửa sức chứa kệ" }, { status: 403 });
  }
  if (roomId !== undefined && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  if (
    !changesPlantOrStaff &&
    roomId === undefined &&
    sharedMotherPool === undefined &&
    allowedCodes === undefined &&
    capacity === undefined
  ) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  // Không cho đặt sức chứa thấp hơn tổng số lượng các lô ACTIVE đang có trên kệ — kệ giờ có thể tích
  // luỹ nhiều lô/quy cách cùng lúc (VD Phòng ra rễ có cả T01 lẫn T05) nên tổng tồn có thể lớn hơn trước. Đơn vị: Phòng
  // mẫu mẹ tính theo cụm, Phòng ra rễ tính theo cây (xem MOTHER_SPEC_BAG_SIZE ở src/types).
  if (capacity != null) {
    const [agg, shelfRoom] = await Promise.all([
      prisma.lot.aggregate({ where: { shelfId: id, status: "ACTIVE" }, _sum: { quantity: true } }),
      prisma.shelf.findUnique({ where: { id }, select: { room: { select: { type: true } } } }),
    ]);
    const used = agg._sum.quantity ?? 0;
    const capacityUnit = shelfRoom?.room?.type === "PHONG_MAU_ME" ? "cụm" : "cây";
    if (used > capacity) {
      return NextResponse.json(
        { message: `Sức chứa mới (${capacity}) nhỏ hơn số lượng đang có trên kệ (${used} ${capacityUnit})` },
        { status: 400 }
      );
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

  let targetRoom: { type: string; code: string } | null = null;
  if (roomId !== undefined) {
    targetRoom = await prisma.room.findUnique({ where: { id: roomId }, select: { type: true, code: true } });
    if (!targetRoom) return NextResponse.json({ message: "Không tìm thấy phòng đích" }, { status: 400 });
  }

  // "Chuyển phòng" đổi nhóm hiển thị của kệ (Kho mẫu mẹ đã chia / Kho mẫu mẹ chung / Phòng ra rễ —
  // xem shelf-table.tsx) chỉ được phép khi kệ đã hết tồn (tổng số lượng lô đang hoạt động = 0), tránh
  // mất dấu vết lô đang nằm trên kệ khi đổi nhóm.
  let regeneratedCode: string | undefined;
  if (roomId !== undefined || assignedStaffId !== undefined) {
    const current = await prisma.shelf.findUnique({
      where: { id },
      select: {
        code: true,
        roomId: true,
        assignedStaffId: true,
        room: { select: { type: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
    });
    if (!current) return NextResponse.json({ message: "Không tìm thấy kệ" }, { status: 404 });

    const currentRoomType = current.room?.type ?? null;
    const targetRoomType = targetRoom ? targetRoom.type : currentRoomType;
    const targetAssignedStaffId =
      targetRoomType !== "PHONG_MAU_ME" ? null : assignedStaffId !== undefined ? assignedStaffId : current.assignedStaffId;

    const groupOf = (rt: string | null, staffId: string | null) =>
      rt === "PHONG_RA_RE" ? "RA_RE" : rt === "PHONG_MAU_ME" ? (staffId ? "DA_CHIA" : "CHUNG") : "OTHER";

    if (groupOf(currentRoomType, current.assignedStaffId) !== groupOf(targetRoomType, targetAssignedStaffId)) {
      const totalQty = current.lots.reduce((s, l) => s + l.quantity, 0);
      if (totalQty > 0) {
        const moveUnit = currentRoomType === "PHONG_MAU_ME" ? "cụm" : "cây";
        return NextResponse.json(
          { message: `Kệ đang còn ${totalQty} ${moveUnit} trong lô — chỉ chuyển được sang nhóm khác khi tồn kệ bằng 0` },
          { status: 400 }
        );
      }
    }

    // Chuyển sang phòng khác (đổi warehouseId/room.code) → sinh lại mã kệ theo đúng tiền tố phòng đích,
    // giữ nguyên phần "khối+cột" phía sau (VD "A01C01") — tránh mã kệ cũ mang tiền tố phòng gốc (VD
    // "SX-E-PRR-...") gây hiểu nhầm sau khi đã chuyển hẳn sang phòng khác (VD Phòng mẫu mẹ "SX-E-PS").
    if (targetRoom && current.roomId !== roomId) {
      const suffix = current.code.split("-").pop()!;
      let candidate = `${targetRoom.code}-${suffix}`;
      let n = 1;
      while (await prisma.shelf.findFirst({ where: { code: candidate, id: { not: id } } })) {
        n += 1;
        candidate = `${targetRoom.code}-${suffix}-${n}`;
      }
      regeneratedCode = candidate;
    }
  }

  const data: {
    plantTypeId?: string | null;
    assignedStaffId?: string | null;
    roomId?: string;
    code?: string;
    sharedMotherPool?: "QUA_HAN" | "DUNG_HAN" | null;
    rotationGroupId?: string | null;
    allowedCodes?: string[];
    capacity?: number | null;
  } = {};
  if (sharedMotherPool !== undefined) data.sharedMotherPool = sharedMotherPool;
  if (allowedCodes !== undefined) data.allowedCodes = allowedCodes;
  if (capacity !== undefined) data.capacity = capacity;

  if (roomId !== undefined && targetRoom) {
    data.roomId = roomId;
    if (regeneratedCode) data.code = regeneratedCode;
    // Rời khỏi Phòng mẫu mẹ thì mã cây/nhân viên không còn ý nghĩa — bỏ gán.
    if (targetRoom.type !== "PHONG_MAU_ME") {
      data.plantTypeId = null;
      data.assignedStaffId = null;
    }
    // Đổi sang phòng khác loại (Phòng ra rễ ↔ Phòng mẫu mẹ ↔ khác) thì Nhóm tuần ra rễ/Nhóm tuần mẫu mẹ
    // đang gán (rotationGroupId) không còn ý nghĩa — bỏ gán, admin gán lại Nhóm phù hợp sau ở
    // /settings/shelf-groups.
    if (targetRoom.type !== "PHONG_RA_RE" && targetRoom.type !== "PHONG_MAU_ME") {
      data.rotationGroupId = null;
    }
    // Rời khỏi Phòng mẫu mẹ thì Cho phép xếp không còn ý nghĩa — bỏ gán.
    if (targetRoom.type !== "PHONG_MAU_ME" && data.allowedCodes === undefined) {
      data.allowedCodes = [];
    }
  }

  const needsAttributeResolve =
    (assignedStaffId !== undefined && data.assignedStaffId === undefined) ||
    (plantTypeId !== undefined && data.plantTypeId === undefined);
  if (needsAttributeResolve) {
    const resolved = await resolveShelfAttributeUpdate(prisma, id, {
      assignedStaffId: assignedStaffId !== undefined && data.assignedStaffId === undefined ? assignedStaffId : undefined,
      plantTypeId: plantTypeId !== undefined && data.plantTypeId === undefined ? plantTypeId : undefined,
    });
    if (!resolved.ok) return NextResponse.json({ message: resolved.message }, { status: 409 });
    if (resolved.data.assignedStaffId !== undefined) data.assignedStaffId = resolved.data.assignedStaffId;
    if (resolved.data.plantTypeId !== undefined) data.plantTypeId = resolved.data.plantTypeId;
    if (resolved.data.sharedMotherPool !== undefined) data.sharedMotherPool = resolved.data.sharedMotherPool;
    if (resolved.data.allowedCodes !== undefined && data.allowedCodes === undefined) data.allowedCodes = resolved.data.allowedCodes;
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
