import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { differenceInCalendarDays } from "date-fns";
import { getWeekBuckets, bucketIndexForDate, isNearExpiry } from "@/lib/report-utils";
import { ROOM_TYPE_LABELS } from "@/types";
import type { RoomType } from "@prisma/client";
import ReportBarChart from "./charts/report-bar-chart";
import ReportLineChart from "./charts/report-line-chart";

const HISTORY_WEEKS = 10;

export default async function InventoryLifecycleReport() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const activeLots = await prisma.lot.findMany({
    where: { status: "ACTIVE" },
    select: {
      code: true,
      enteredAt: true,
      expectedMoveAt: true,
      plantType: { select: { name: true } },
      shelf: { select: { room: { select: { type: true } } } },
    },
  });

  // (a) Tuổi trung bình theo loại phòng
  const ageByRoomType = new Map<string, { total: number; count: number }>();
  for (const lot of activeLots) {
    const roomType = lot.shelf?.room?.type;
    if (!roomType) continue;
    const age = differenceInCalendarDays(new Date(), lot.enteredAt);
    if (!ageByRoomType.has(roomType)) ageByRoomType.set(roomType, { total: 0, count: 0 });
    const e = ageByRoomType.get(roomType)!;
    e.total += age;
    e.count += 1;
  }
  const ageData = Array.from(ageByRoomType.entries()).map(([type, e]) => ({
    "Loại phòng": ROOM_TYPE_LABELS[type as RoomType],
    "Tuổi TB (ngày)": Math.round(e.total / e.count),
  }));

  // (b) Danh sách sắp/quá hạn
  const nearExpiryLots = activeLots
    .filter((l) => isNearExpiry(l.expectedMoveAt))
    .sort((a, b) => (a.expectedMoveAt?.getTime() ?? 0) - (b.expectedMoveAt?.getTime() ?? 0))
    .slice(0, 15);

  // (c) Lô nhập kho theo tuần
  const enteredByWeek = buckets.map(() => 0);
  const allLotsForTrend = await prisma.lot.findMany({
    where: { enteredAt: { gte: buckets[0].start } },
    select: { enteredAt: true },
  });
  for (const lot of allLotsForTrend) {
    const idx = bucketIndexForDate(buckets, lot.enteredAt);
    if (idx !== -1) enteredByWeek[idx] += 1;
  }
  const trendData = buckets.map((b, i) => ({ Tuần: b.label, "Lô nhập kho": enteredByWeek[i] }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tuổi trung bình lô hàng theo loại phòng</CardTitle>
          <p className="text-sm text-text-secondary">Số ngày trung bình lô đang lưu tại phòng tính từ lúc nhập</p>
        </CardHeader>
        <CardContent>
          {ageData.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu</p>
          ) : (
            <ReportBarChart
              data={ageData}
              xKey="Loại phòng"
              unit=" ngày"
              series={[{ key: "Tuổi TB (ngày)", label: "Tuổi TB (ngày)", color: "#2a78d6" }]}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lô sắp/quá hạn chuyển giai đoạn</CardTitle>
          <p className="text-sm text-text-secondary">Còn ≤3 ngày hoặc đã quá hạn dự kiến chuyển giai đoạn</p>
        </CardHeader>
        <CardContent className="p-0">
          {nearExpiryLots.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Không có lô nào sắp/quá hạn</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Mã lô</th>
                    <th className="text-left px-3 py-2 text-primary-strong font-bold text-base">Loại cây</th>
                    <th className="text-right px-3 py-2 text-primary-strong font-bold text-base">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {nearExpiryLots.map((lot) => {
                    const daysLeft = lot.expectedMoveAt ? differenceInCalendarDays(lot.expectedMoveAt, new Date()) : null;
                    const overdue = daysLeft !== null && daysLeft < 0;
                    return (
                      <tr key={lot.code} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                        <td className="px-3 py-2 font-mono">{lot.code}</td>
                        <td className="px-3 py-2">{lot.plantType.name}</td>
                        <td className="px-3 py-2 text-right">
                          <Badge className={overdue ? "bg-danger-light text-destructive" : "bg-warning-light text-warning-foreground"}>
                            {overdue ? `Quá hạn ${Math.abs(daysLeft!)} ngày` : `Còn ${daysLeft} ngày`}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lô nhập kho theo tuần</CardTitle>
          <p className="text-sm text-text-secondary">
            Số lô mới nhập kho mỗi tuần — <strong>không phải</strong> tồn kho tại từng thời điểm (hệ thống chưa lưu lịch sử tồn kho theo thời gian)
          </p>
        </CardHeader>
        <CardContent>
          <ReportLineChart
            data={trendData}
            xKey="Tuần"
            unit=" lô"
            series={[{ key: "Lô nhập kho", label: "Lô nhập kho", color: "#2a78d6" }]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
