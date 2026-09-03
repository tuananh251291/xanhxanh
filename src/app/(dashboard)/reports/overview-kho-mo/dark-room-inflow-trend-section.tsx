import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate } from "@/lib/report-utils";
import ReportLineChart from "../charts/report-line-chart";

const HISTORY_WEEKS = 10;

// Xu hướng số lượng NHẬN từ phòng tối lên kho sáng — gộp theo tuần XÁC NHẬN (Transfer.confirmedAt), chỉ
// tính phiếu đã CONFIRMED (Kho mô đã xác nhận nhận + xếp kệ xong, xem receive-phong-toi.ts) nguồn từ
// Room type PHONG_TOI. `warehouseId` lọc theo kho đích (toWarehouseId) — null = toàn hệ thống.
export default async function DarkRoomInflowTrendSection({ warehouseId }: { warehouseId: string | null }) {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const transfers = await prisma.transfer.findMany({
    where: {
      status: "CONFIRMED",
      confirmedAt: { gte: buckets[0].start },
      fromRoom: { type: "PHONG_TOI" },
      ...(warehouseId ? { toWarehouseId: warehouseId } : {}),
    },
    select: { confirmedAt: true, items: { select: { quantity: true } } },
  });

  const byWeek = buckets.map(() => 0);
  for (const t of transfers) {
    if (!t.confirmedAt) continue;
    const idx = bucketIndexForDate(buckets, t.confirmedAt);
    if (idx === -1) continue;
    byWeek[idx] += t.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  const data = buckets.map((b, i) => ({ Tuần: b.label, "Số lượng nhận": byWeek[i] }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Xu hướng nhận bàn giao từ phòng tối</CardTitle>
        <p className="text-sm text-text-secondary">Tổng số lượng đã xác nhận nhận lên kho sáng, theo {HISTORY_WEEKS} tuần gần nhất</p>
      </CardHeader>
      <CardContent>
        <ReportLineChart data={data} xKey="Tuần" series={[{ key: "Số lượng nhận", label: "Số lượng nhận", color: "#0ca30c" }]} />
      </CardContent>
    </Card>
  );
}
