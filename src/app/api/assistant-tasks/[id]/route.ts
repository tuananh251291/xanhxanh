import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canUseAssistantTasks } from "@/lib/assistant-task";
import { assistantTaskSchema, assistantTaskInclude } from "@/lib/assistant-task-schema";

// Sửa toàn bộ 1 dòng (hộp thoại Sửa) hoặc chỉ đổi trạng thái (ô chọn nhanh trên bảng) — cùng 1 PATCH, gửi
// thiếu field nào thì giữ nguyên field đó.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canUseAssistantTasks(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.assistantTask.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ message: "Không tìm thấy công việc" }, { status: 404 });

  const merged = {
    category: existing.category,
    title: existing.title,
    responsibleId: existing.responsibleId,
    assignedDate: existing.assignedDate.toISOString().slice(0, 10),
    deadline: existing.deadline.toISOString().slice(0, 10),
    status: existing.status,
    blocker: existing.blocker,
    repeat: existing.repeat,
    repeatWeekdays: existing.repeatWeekdays,
    ...((await req.json().catch(() => ({}))) as object),
  };
  const parsed = assistantTaskSchema.safeParse(merged);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const d = parsed.data;
  if (d.responsibleId !== existing.responsibleId) {
    const responsible = await prisma.user.findUnique({ where: { id: d.responsibleId }, select: { isActive: true } });
    if (!responsible?.isActive) return NextResponse.json({ message: "Người chịu trách nhiệm không tồn tại hoặc đã nghỉ" }, { status: 400 });
  }

  // Đổi cài đặt lặp hoặc ngày bàn giao → mốc lặp (ngày gốc của chuỗi) tính lại từ ngày bàn giao hiện tại.
  const weekdays = d.repeat === "WEEKLY" ? [...new Set(d.repeatWeekdays)].sort() : [];
  const repeatChanged =
    d.repeat !== existing.repeat ||
    weekdays.join(",") !== existing.repeatWeekdays.join(",") ||
    d.assignedDate !== existing.assignedDate.toISOString().slice(0, 10);
  const repeatAnchorDate =
    d.repeat === "NONE" ? null : repeatChanged || !existing.repeatAnchorDate ? new Date(d.assignedDate) : existing.repeatAnchorDate;

  const task = await prisma.assistantTask.update({
    where: { id },
    data: {
      category: d.category,
      title: d.title,
      responsibleId: d.responsibleId,
      assignedDate: new Date(d.assignedDate),
      deadline: new Date(d.deadline),
      status: d.status,
      // Giữ nguyên lúc hoàn thành gốc nếu vẫn Hoàn thành; mới chuyển sang Hoàn thành thì ghi bây giờ.
      completedAt: d.status === "HOAN_THANH" ? (existing.completedAt ?? new Date()) : null,
      blocker: d.blocker || null,
      repeat: d.repeat,
      repeatWeekdays: weekdays,
      repeatAnchorDate,
    },
    include: assistantTaskInclude,
  });
  return NextResponse.json(task);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!canUseAssistantTasks(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { id } = await params;
  await prisma.assistantTask.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
