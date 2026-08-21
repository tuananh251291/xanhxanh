import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { computeViolationPointsApplied } from "@/lib/violation-points";
import { DARK_ROOM_CHECK_VIOLATION_GROUPS } from "@/types";
import { z } from "zod";

const schema = z.object({
  checklistItemId: z.string().min(1),
  // Tuỳ chọn — để trống khi KHO_MO không chọn đích danh NV nào (VD hôm nay không phát hiện vi phạm nào,
  // hoặc không còn NV cấy mô nào để chọn) vẫn được phép hoàn thành nhiệm vụ nhỏ này, chỉ là không có bản
  // ghi kiểm tra gắn với 1 NV cụ thể.
  staffId: z.string().min(1).optional(),
  violationTypeIds: z.array(z.string().min(1)),
});

// NV kho mô "Hoàn tất kiểm tra" 1 lượt trong nhiệm vụ nhỏ "Kiểm tra kho cá nhân" (thuộc checklist "Kiểm
// tra kho tối") — chọn 0 hoặc 1 NV cấy mô + 0 hoặc nhiều lỗi vi phạm tìm thấy (không chọn NV thì không
// được kèm lỗi vi phạm, vì không có ai để gắn lỗi vào). Bật subTask1Done ngay khi có lượt đầu tiên trong
// ngày (không bắt buộc đi hết mọi NV cấy mô, cũng không bắt buộc phải chọn NV — xem
// ChecklistItem.subTask1Done), completed suy ra từ cả 2 nhiệm vụ nhỏ. Nếu có vi phạm, báo cho đúng NV
// cấy mô đó.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { checklistItemId, staffId, violationTypeIds } = parsed.data;

  if (!staffId && violationTypeIds.length > 0) {
    return NextResponse.json({ message: "Phải chọn NV cấy mô mới ghi nhận được lỗi vi phạm" }, { status: 400 });
  }

  const item = await prisma.checklistItem.findUnique({ where: { id: checklistItemId } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy đầu việc" }, { status: 404 });
  if (item.userId !== session.user.id) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  if (item.kind !== "DARK_ROOM_CHECK") {
    return NextResponse.json({ message: "Đầu việc này không có nhiệm vụ Kiểm tra kho cá nhân" }, { status: 400 });
  }

  if (staffId) {
    const staff = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, role: true } });
    if (!staff || staff.role !== "CAY_MO") {
      return NextResponse.json({ message: "Không tìm thấy NV cấy mô" }, { status: 400 });
    }
  }

  if (violationTypeIds.length > 0) {
    // Nhiệm vụ nhỏ này chỉ ghi nhận được lỗi thuộc 2 nhóm liên quan tới kiểm tra kho tối — khớp danh
    // sách đã lọc sẵn ở client (DarkRoomInspectionDialog), chặn luôn cả trường hợp gọi thẳng API.
    const validCount = await prisma.violationType.count({
      where: { id: { in: violationTypeIds }, isActive: true, groupName: { in: [...DARK_ROOM_CHECK_VIOLATION_GROUPS] } },
    });
    if (validCount !== violationTypeIds.length) {
      return NextResponse.json({ message: "Có loại lỗi vi phạm không hợp lệ" }, { status: 400 });
    }
  }

  const nowCompleted = item.subTask2Done; // subTask1 vừa bật = true, completed = subTask1 && subTask2
  const itemUpdate = prisma.checklistItem.update({
    where: { id: checklistItemId },
    data: { subTask1Done: true, completed: nowCompleted, completedAt: nowCompleted ? new Date() : null },
  });
  const shouldLogTransition = nowCompleted !== item.completed;

  // Chỉ tạo bản ghi "đã kiểm tra ai" khi có chọn đích danh NV — không có NV thì không có gì để ghi (chỉ
  // cần bật subTask1Done).
  let check: { id: string } | null = null;
  if (staffId) {
    // Điểm áp dụng snapshot tại đây (không tính lại sống lúc xem lương sau này) — xem
    // computeViolationPointsApplied (x1.5 nếu là lần 2+ trong kỳ, cùng NV, cùng loại lỗi).
    const now = new Date();
    const violationTypes = violationTypeIds.length
      ? await prisma.violationType.findMany({ where: { id: { in: violationTypeIds } }, select: { id: true, points: true } })
      : [];
    const violationsCreate = await Promise.all(
      violationTypes.map(async (vt) => ({
        violationTypeId: vt.id,
        staffId,
        createdById: session.user.id,
        pointsApplied: await computeViolationPointsApplied(staffId, vt.id, vt.points, now),
        createdAt: now,
      }))
    );
    const checkCreate = prisma.darkRoomInspectionCheck.create({
      data: {
        checklistItemId,
        staffId,
        checkedById: session.user.id,
        violations: { create: violationsCreate },
      },
    });
    const results = shouldLogTransition
      ? await prisma.$transaction([checkCreate, itemUpdate, prisma.checklistItemLog.create({ data: { itemId: checklistItemId, completed: nowCompleted } })])
      : await prisma.$transaction([checkCreate, itemUpdate]);
    check = results[0];
  } else if (shouldLogTransition) {
    await prisma.$transaction([itemUpdate, prisma.checklistItemLog.create({ data: { itemId: checklistItemId, completed: nowCompleted } })]);
  } else {
    await itemUpdate;
  }

  if (staffId && violationTypeIds.length > 0 && check) {
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

  return NextResponse.json({ id: check?.id ?? null }, { status: 201 });
}
