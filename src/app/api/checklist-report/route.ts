import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { parseISO, isValid } from "date-fns";
import { getDailyTaskChecklist } from "@/lib/task-completion-report";

const DEFAULT_MIN_PERCENT = 80;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const parsedDate = dateParam ? parseISO(dateParam) : new Date();
  const date = isValid(parsedDate) ? parsedDate : new Date();

  const [rows, thresholds] = await Promise.all([
    getDailyTaskChecklist(date),
    prisma.checklistThreshold.findMany(),
  ]);

  const thresholdByRole = new Map(thresholds.map((t) => [t.role, t.minPercent]));

  const result = rows
    .map((r) => {
      const total = r.items.length;
      const completed = r.items.filter((it) => it.completed).length;
      const percent = Math.round((completed / total) * 100);
      const thresholdPercent = thresholdByRole.get(r.role) ?? DEFAULT_MIN_PERCENT;
      return { ...r, total, completed, percent, thresholdPercent, belowThreshold: percent < thresholdPercent };
    })
    .sort((a, b) => a.userName.localeCompare(b.userName));

  return NextResponse.json(result);
}
