import { NextRequest, NextResponse } from "next/server";
import { assistantTaskSchema, assistantTaskInclude } from "@/lib/assistant-task-schema";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canUseAssistantTasks } from "@/lib/assistant-task";
import { ensureAssistantTaskRepeats } from "@/lib/assistant-task-repeat";

export async function GET() {
  const session = await auth();
  if (!canUseAssistantTasks(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  // Tới kỳ kế tiếp của công việc lặp lại thì tạo công việc mới trước khi trả danh sách.
  await ensureAssistantTaskRepeats();
  const tasks = await prisma.assistantTask.findMany({ include: assistantTaskInclude, orderBy: [{ deadline: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !canUseAssistantTasks(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const parsed = assistantTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  const d = parsed.data;
  const responsible = await prisma.user.findUnique({ where: { id: d.responsibleId }, select: { isActive: true } });
  if (!responsible?.isActive) return NextResponse.json({ message: "Người chịu trách nhiệm không tồn tại hoặc đã nghỉ" }, { status: 400 });

  const task = await prisma.assistantTask.create({
    data: {
      category: d.category,
      title: d.title,
      responsibleId: d.responsibleId,
      assignedDate: new Date(d.assignedDate),
      deadline: new Date(d.deadline),
      status: d.status,
      completedAt: d.status === "HOAN_THANH" ? new Date() : null,
      blocker: d.blocker || null,
      repeat: d.repeat,
      repeatWeekdays: d.repeat === "WEEKLY" ? [...new Set(d.repeatWeekdays)].sort() : [],
      repeatAnchorDate: d.repeat === "NONE" ? null : new Date(d.assignedDate),
      createdById: session.user.id,
    },
    include: assistantTaskInclude,
  });
  return NextResponse.json(task, { status: 201 });
}
