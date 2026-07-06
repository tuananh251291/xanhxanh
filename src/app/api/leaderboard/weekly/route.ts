import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { motherClusterUnits } from "@/types";
import { startOfWeek, endOfWeek } from "date-fns";

type RankingEntry = { staffId: string; name: string; total: number };

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const records = await prisma.dailyRecord.findMany({
    where: { recordDate: { gte: weekStart, lte: weekEnd } },
    select: {
      staffId: true,
      staff: { select: { name: true } },
      items: { select: { stage: true, quantityCreated: true, lot: { select: { stageCode: true } } } },
    },
  });

  const finishedMap = new Map<string, RankingEntry>();
  const motherMap = new Map<string, RankingEntry>();

  for (const record of records) {
    for (const item of record.items) {
      const map = item.stage === "THANH_PHAM" ? finishedMap : item.stage === "MAU_ME" ? motherMap : null;
      if (!map) continue;

      const amount = item.stage === "MAU_ME"
        ? motherClusterUnits(item.lot.stageCode, item.quantityCreated)
        : item.quantityCreated;

      const cur = map.get(record.staffId) ?? { staffId: record.staffId, name: record.staff.name, total: 0 };
      cur.total += amount;
      map.set(record.staffId, cur);
    }
  }

  const toRanking = (map: Map<string, RankingEntry>) =>
    Array.from(map.values()).sort((a, b) => b.total - a.total);

  return NextResponse.json({
    weekStart,
    weekEnd,
    finished: toRanking(finishedMap),
    mother: toRanking(motherMap),
  });
}
