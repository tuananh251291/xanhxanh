import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate } from "@/lib/report-utils";
import ReportBarChart from "./charts/report-bar-chart";

const HISTORY_WEEKS = 10;

export default async function ProductionReport() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const items = await prisma.dailyRecordItem.findMany({
    where: { dailyRecord: { recordDate: { gte: buckets[0].start } } },
    select: {
      stage: true,
      quantityCreated: true,
      dailyRecord: { select: { recordDate: true } },
    },
  });

  const data = buckets.map((b) => ({ Tuần: b.label, "Mẫu mẹ": 0, "Thành phẩm": 0 }));
  for (const item of items) {
    const idx = bucketIndexForDate(buckets, item.dailyRecord.recordDate);
    if (idx === -1) continue;
    if (item.stage === "MAU_ME") data[idx]["Mẫu mẹ"] += item.quantityCreated;
    else data[idx]["Thành phẩm"] += item.quantityCreated;
  }

  const totalMother = data.reduce((s, d) => s + d["Mẫu mẹ"], 0);
  const totalFinished = data.reduce((s, d) => s + d["Thành phẩm"], 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sản lượng theo thời gian ({HISTORY_WEEKS} tuần gần nhất)</CardTitle>
        <p className="text-sm text-text-secondary">
          Tổng mẫu mẹ: <strong>{totalMother.toLocaleString("vi-VN")}</strong> · Tổng thành phẩm: <strong>{totalFinished.toLocaleString("vi-VN")}</strong>
        </p>
      </CardHeader>
      <CardContent>
        <ReportBarChart
          data={data}
          xKey="Tuần"
          series={[
            { key: "Mẫu mẹ", label: "Mẫu mẹ", color: "#2a78d6" },
            { key: "Thành phẩm", label: "Thành phẩm", color: "#1baf7a" },
          ]}
        />
      </CardContent>
    </Card>
  );
}
