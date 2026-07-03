import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureTodayChecklist, getTodayChecklist } from "@/lib/checklist";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureTodayChecklist(session.user.id, session.user.role);
  const items = await getTodayChecklist(session.user.id);
  return NextResponse.json(items);
}
