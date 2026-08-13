import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const schema = z.object({
  checklistItemId: z.string().min(1),
  staffId: z.string().min(1),
  violationTypeIds: z.array(z.string().min(1)),
});

// NV kho mô "Hoàn tất kiểm tra" 1 lượt trong nhiệm vụ nhỏ "Kiểm tra kho cá nhân" (thuộc checklist "Kiểm
// tra kho tối") — chọn 1 NV cấy mô + 0 hoặc nhiều lỗi vi phạm tìm thấy. Bật subTask1Done ngay khi có
// lượt đầu tiên trong ngày (không bắt buộc đi hết mọi NV cấy mô — xem ChecklistItem.subTask1Done),
// completed suy ra từ cả 2 nhiệm vụ nhỏ. Nếu có vi phạm, báo cho đúng NV cấy mô đó.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { checklistItemId, staffId, violationTypeIds } = parsed.data;

  const item = await prisma.checklistItem.findUnique({ where: { id: checklistItemId } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy đầu việc" }, { status: 404 });
  if (item.userId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (item.kind !== "DARK_ROOM_CHECK") {
    return NextResponse.json({ message: "Đầu việc này không có nhiệm vụ Kiểm tra kho cá nhân" }, { status: 400 });
  }

  const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, role: true } });
  if (!staff || staff.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });
  }

  if (violationTypeIds.length > 0) {
    const validCount = await prisma.violationType.count({ where: { id: { in: violationTypeIds }, isActive: true } });
    if (validCount !== violationTypeIds.length) {
      return NextResponse.json({ message: "Có loại lỗi vi phạm không hợp lệ" }, { status: 400 });
    }
  }

  const nowCompleted = item.subTask2Done; // subTask1 vừa bật = true, completed = subTask1 && subTask2
  const checkCreate = prisma.darkRoomInspectionCheck.create({
    data: {
      checklistItemId,
      staffId,
      checkedById: session.user.id,
      violations: { create: violationTypeIds.map((violationTypeId) => ({ violationTypeId })) },
    },
  });
  const itemUpdate = prisma.checklistItem.update({
    where: { id: checklistItemId },
    data: { subTask1Done: true, completed: nowCompleted, completedAt: nowCompleted ? new Date() : null },
  });
  const [check] =
    nowCompleted !== item.completed
      ? await prisma.$transaction([checkCreate, itemUpdate, prisma.checklistItemLog.create({ data: { itemId: checklistItemId, completed: nowCompleted } })])
      : await prisma.$transaction([checkCreate, itemUpdate]);

  if (violationTypeIds.length > 0) {
    try {
      const types = await prisma.violationType.findMany({ where: { id: { in: violationTypeIds } }, select: { label: true } });
      await createAlert({
        type: "NV_VIOLATION",
        title: "Bạn vừa bị ghi nhận vi phạm khi kiểm tra kho tối",
        message: `Lỗi: ${types.map((t) => t.label).join(", ")}`,
        userId: staffId,
        relatedId: check.id,
        relatedType: "DarkRoomInspectionCheck",
      });
    } catch (err) {
      console.error("[dark-room-inspection] Không gửi được thông báo NV_VIOLATION:", err);
    }
  }

  return NextResponse.json(check, { status: 201 });
}
