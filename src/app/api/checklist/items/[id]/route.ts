import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";
import { isSameDay } from "date-fns";

const schema = z.union([
  z.object({ completed: z.boolean() }),
  z.object({ subTask2Done: z.boolean() }),
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const item = await prisma.checklistItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (item.userId !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  // Kind DARK_ROOM_CHECK ("Kiểm tra kho tối") — nhiệm vụ nhỏ 2 (tick tự khai báo "kho nhiễm cá nhân"),
  // completed suy ra từ cả 2 nhiệm vụ nhỏ (nhiệm vụ 1 bật qua POST /api/dark-room-inspection).
  if ("subTask2Done" in parsed.data) {
    if (item.kind !== "DARK_ROOM_CHECK") {
      return NextResponse.json({ message: "Đầu việc này không có nhiệm vụ nhỏ" }, { status: 400 });
    }
    if (item.completed && !parsed.data.subTask2Done && item.completedAt && !isSameDay(item.completedAt, new Date())) {
      return NextResponse.json({ message: "Không thể bỏ đánh dấu việc đã hoàn thành từ ngày trước" }, { status: 400 });
    }
    if (item.subTask2Done === parsed.data.subTask2Done) {
      return NextResponse.json(item);
    }

    const nowCompleted = item.subTask1Done && parsed.data.subTask2Done;
    const updateData = {
      subTask2Done: parsed.data.subTask2Done,
      subTask2At: parsed.data.subTask2Done ? new Date() : null,
      completed: nowCompleted,
      completedAt: nowCompleted ? new Date() : null,
    };
    const updated =
      nowCompleted !== item.completed
        ? (await prisma.$transaction([
            prisma.checklistItem.update({ where: { id }, data: updateData }),
            prisma.checklistItemLog.create({ data: { itemId: id, completed: nowCompleted } }),
          ]))[0]
        : await prisma.checklistItem.update({ where: { id }, data: updateData });
    return NextResponse.json(updated);
  }

  // kind SIMPLE (mặc định, hành vi cũ) — 1 checkbox = 1 việc.
  if (item.kind !== "SIMPLE") {
    return NextResponse.json({ message: "Đầu việc này cần thao tác qua nhiệm vụ nhỏ" }, { status: 400 });
  }

  // Chặn bỏ đánh dấu việc đã hoàn thành từ hôm trước — tránh sửa ngược lịch sử báo cáo đã ghi nhận
  // ở ngày hôm đó. Bỏ đánh dấu chỉ được phép trong cùng ngày vừa hoàn thành (sửa lỗi bấm nhầm).
  if (item.completed && !parsed.data.completed && item.completedAt && !isSameDay(item.completedAt, new Date())) {
    return NextResponse.json({ message: "Không thể bỏ đánh dấu việc đã hoàn thành từ ngày trước" }, { status: 400 });
  }

  if (item.completed === parsed.data.completed) {
    return NextResponse.json(item);
  }

  const [updated] = await prisma.$transaction([
    prisma.checklistItem.update({
      where: { id },
      data: {
        completed: parsed.data.completed,
        completedAt: parsed.data.completed ? new Date() : null,
      },
    }),
    prisma.checklistItemLog.create({
      data: { itemId: id, completed: parsed.data.completed },
    }),
  ]);

  return NextResponse.json(updated);
}
