import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { resolveShelfAttributeUpdate } from "@/lib/shelf-attribute-update";

const patchSchema = z.object({
  // undefined = không đổi, null = bỏ gán, string = gán mới — giống hệt ShelfAttributeUpdateInput.
  plantTypeId: z.string().nullable().optional(),
  assignedStaffId: z.string().nullable().optional(),
});

// Gán mã cây/NV cấy mô cho 1 giàn kệ Phòng mẫu mẹ — dành cho NV kho mô (khác /api/shelves/[id], vốn chỉ
// SUPER_ADMIN mới sửa được 2 trường này) — chỉ cho thao tác đúng kệ Phòng mẫu mẹ trong ĐÚNG kho làm việc
// (workplaceWarehouseId) của NV đó, dùng lại đúng quy tắc nghiệp vụ ở resolveShelfAttributeUpdate (chặn
// gán NV không phải CAY_MO/thuộc kho khác, chặn đổi mã cây khi kệ còn lô của mã cây khác).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") {
    return NextResponse.json({ message: "Chỉ nhân viên kho mô mới dùng được chức năng này" }, { status: 403 });
  }
  const workplaceWarehouseId = session.user.workplaceWarehouseId;
  if (!workplaceWarehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc — liên hệ Admin trước khi gán kệ" }, { status: 400 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  if (parsed.data.plantTypeId === undefined && parsed.data.assignedStaffId === undefined) {
    return NextResponse.json({ message: "Không có gì để cập nhật" }, { status: 400 });
  }

  const shelf = await prisma.shelf.findUnique({
    where: { id },
    select: { warehouseId: true, isActive: true, room: { select: { type: true } } },
  });
  if (!shelf || !shelf.isActive) return NextResponse.json({ message: "Không tìm thấy kệ" }, { status: 404 });
  if (shelf.room?.type !== "PHONG_MAU_ME") {
    return NextResponse.json({ message: "Chỉ gán được mã cây/nhân viên cho giàn mẫu mẹ" }, { status: 400 });
  }
  if (shelf.warehouseId !== workplaceWarehouseId) {
    return NextResponse.json({ message: "Chỉ được thao tác giàn kệ trong kho mình phụ trách" }, { status: 403 });
  }

  if (parsed.data.plantTypeId) {
    const plantType = await prisma.plantType.findUnique({ where: { id: parsed.data.plantTypeId }, select: { isActive: true } });
    if (!plantType || !plantType.isActive) return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  }

  const resolved = await resolveShelfAttributeUpdate(prisma, id, {
    plantTypeId: parsed.data.plantTypeId,
    assignedStaffId: parsed.data.assignedStaffId,
  });
  if (!resolved.ok) return NextResponse.json({ message: resolved.message }, { status: 409 });

  const updated = await prisma.shelf.update({
    where: { id },
    data: resolved.data,
    include: {
      plantType: { select: { id: true, code: true, name: true } },
      assignedStaff: { select: { id: true, code: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
