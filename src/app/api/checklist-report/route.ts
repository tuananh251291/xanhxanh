import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { startOfDay, endOfDay, parseISO, isValid } from "date-fns";
import type { UserRole } from "@prisma/client";

const DEFAULT_MIN_PERCENT = 80;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const parsedDate = dateParam ? parseISO(dateParam) : new Date();
  const date = isValid(parsedDate) ? parsedDate : new Date();

  // Tính vào báo cáo ngày `date`: (a) việc còn PENDING đã giao từ ngày đó trở về trước — vẫn tính là
  // "chưa xong" của MỌI ngày nó còn tồn đọng, không chỉ ngày giao đầu tiên (việc dồn ngày không được
  // cập nhật assignedDate nên không thể lọc theo assignedDate == date cho case này); (b) việc đã hoàn
  // thành ĐÚNG trong ngày đó.
  const [items, thresholds] = await Promise.all([
    prisma.checklistItem.findMany({
      where: {
        user: { isActive: true },
        OR: [
          { completed: false, assignedDate: { lte: endOfDay(date) } },
          { completedAt: { gte: startOfDay(date), lte: endOfDay(date) } },
        ],
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        logs: { orderBy: { changedAt: "asc" }, select: { completed: true, changedAt: true } },
      },
    }),
    prisma.checklistThreshold.findMany(),
  ]);

  const thresholdByRole = new Map(thresholds.map((t) => [t.role, t.minPercent]));

  type Row = {
    userId: string;
    userName: string;
    role: UserRole;
    total: number;
    completed: number;
    items: {
      id: string;
      title: string;
      completed: boolean;
      assignedDate: Date;
      completedAt: Date | null;
      logs: { completed: boolean; changedAt: Date }[];
    }[];
  };

  const byUser = new Map<string, Row>();
  for (const item of items) {
    if (!item.user.role) continue;
    if (!byUser.has(item.userId)) {
      byUser.set(item.userId, { userId: item.userId, userName: item.user.name, role: item.user.role, total: 0, completed: 0, items: [] });
    }
    const entry = byUser.get(item.userId)!;
    entry.total += 1;
    if (item.completed) entry.completed += 1;
    entry.items.push({
      id: item.id,
      title: item.title,
      completed: item.completed,
      assignedDate: item.assignedDate,
      completedAt: item.completedAt,
      logs: item.logs,
    });
  }

  const result = Array.from(byUser.values())
    .map((e) => {
      const percent = e.total > 0 ? Math.round((e.completed / e.total) * 100) : 0;
      const thresholdPercent = thresholdByRole.get(e.role) ?? DEFAULT_MIN_PERCENT;
      return { ...e, percent, thresholdPercent, belowThreshold: percent < thresholdPercent };
    })
    .sort((a, b) => a.userName.localeCompare(b.userName));

  return NextResponse.json(result);
}
