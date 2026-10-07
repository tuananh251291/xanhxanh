import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { startOfWeek, endOfWeek } from "date-fns";

// plantTypes: chi tiết theo loại cây NV đã cấy ra trong tuần — CHỈ trả về khi người xem là Admin kỹ thuật/NV kỹ thuật
// (ADMIN_KY_THUAT/KY_THUAT), lọc ngay ở server để NV cấy mô/vai trò khác không đọc được qua API dù UI có ẩn.
type PlantTypeBreakdown = { code: string; name: string; total: number };
type RankingEntry = { staffId: string; name: string; total: number; plantTypes?: PlantTypeBreakdown[] };

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ message: "Chưa đăng nhập" }, { status: 401 });
  }
  const showPlantTypes = session.user.role === "ADMIN_KY_THUAT" || session.user.role === "KY_THUAT";

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

  const records = await prisma.dailyRecord.findMany({
    where: { recordDate: { gte: weekStart, lte: weekEnd } },
    select: {
      staffId: true,
      staff: { select: { name: true } },
      items: { select: { stage: true, quantityCreated: true, lot: { select: { plantType: { select: { code: true, name: true } } } } } },
    },
  });

  const finishedMap = new Map<string, RankingEntry>();
  const motherMap = new Map<string, RankingEntry>();

  for (const record of records) {
    for (const item of record.items) {
      const map = item.stage === "THANH_PHAM" ? finishedMap : item.stage === "MAU_ME" ? motherMap : null;
      if (!map) continue;

      // quantityCreated đã tính thẳng theo cụm (M05) / cây (T01/T05/T10) — không cần quy đổi.
      const amount = item.quantityCreated;

      const cur = map.get(record.staffId) ?? { staffId: record.staffId, name: record.staff.name, total: 0, ...(showPlantTypes ? { plantTypes: [] } : {}) };
      cur.total += amount;
      if (cur.plantTypes && amount > 0) {
        const { code, name } = item.lot.plantType;
        const pt = cur.plantTypes.find((p) => p.code === code);
        if (pt) pt.total += amount;
        else cur.plantTypes.push({ code, name, total: amount });
      }
      map.set(record.staffId, cur);
    }
  }

  const toRanking = (map: Map<string, RankingEntry>) =>
    Array.from(map.values())
      .map((e) => (e.plantTypes ? { ...e, plantTypes: e.plantTypes.sort((a, b) => b.total - a.total) } : e))
      .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    weekStart,
    weekEnd,
    finished: toRanking(finishedMap),
    mother: toRanking(motherMap),
  });
}
