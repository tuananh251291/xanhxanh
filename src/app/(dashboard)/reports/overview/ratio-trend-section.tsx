import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate, type WeekBucket } from "@/lib/report-utils";
import ReportLineChart from "../charts/report-line-chart";

const HISTORY_WEEKS = 10;

// Tỉ lệ nhân MM / ra TP theo thời gian, thực tế so với mục tiêu — thực tế gộp theo NGÀY NHẬP nhật ký
// (DailyRecord.recordDate), mục tiêu gộp theo TUẦN THỰC HIỆN của chỉ định (PlantingInstruction.weekStart)
// vì mục tiêu là số KY_THUAT đặt sẵn lúc tạo chỉ định cho cả tuần, không phát sinh theo từng ngày nhập
// liệu — 2 cách gộp xấp xỉ cùng 1 tuần lịch nên so sánh được, không cần quy đổi thêm.
export default async function RatioTrendSection() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const [dailyRecords, instructions] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { recordDate: { gte: buckets[0].start } },
      select: { recordDate: true, motherUsed: true, items: { select: { stage: true, quantityCreated: true } } },
    }),
    prisma.plantingInstruction.findMany({
      where: { weekStart: { gte: buckets[0].start } },
      select: {
        weekStart: true,
        inputMotherQuantity: true,
        expectedFinishedOutput: true,
        items: { select: { stageCode: true, expectedMotherOutput: true, expectedPreRootingMotherOutput: true } },
      },
    }),
  ]);

  const actual = buckets.map(() => ({ motherUsed: 0, motherOutput: 0, finishedOutput: 0 }));
  for (const rec of dailyRecords) {
    const idx = bucketIndexForDate(buckets, rec.recordDate);
    if (idx === -1) continue;
    actual[idx].motherUsed += rec.motherUsed;
    for (const item of rec.items) {
      if (item.stage === "MAU_ME") actual[idx].motherOutput += item.quantityCreated;
      else actual[idx].finishedOutput += item.quantityCreated;
    }
  }

  const target = buckets.map(() => ({ inputMotherQuantity: 0, expectedMotherOutput: 0, expectedFinishedOutput: 0 }));
  for (const inst of instructions) {
    if (!inst.weekStart) continue;
    const idx = bucketIndexForDate(buckets, inst.weekStart);
    if (idx === -1) continue;
    target[idx].inputMotherQuantity += inst.inputMotherQuantity;
    // Cộng gộp cả mẫu mẹ thường + tiền ra rễ (2 mục tiêu tính độc lập trên CÙNG số MM sử dụng, xem cùng
    // logic ở /api/daily-records) — thực tế (actual[idx].motherOutput) vốn đã là tổng của cả 2 loại.
    target[idx].expectedMotherOutput += inst.items
      .filter((i) => i.stageCode === "M05")
      .reduce((s, i) => s + (i.expectedMotherOutput ?? 0) + (i.expectedPreRootingMotherOutput ?? 0), 0);
    target[idx].expectedFinishedOutput += inst.expectedFinishedOutput ?? 0;
  }

  // Hiện dạng hệ số (VD 1,8) — đúng đơn vị KY_THUAT đã gõ lúc tạo chỉ định (motherSampleRatio/rootingRatio),
  // không quy đổi ra % (xem cùng quy ước ở instructions/[id]/page.tsx fmtRatio).
  const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) / 100 : 0);

  const motherData = buckets.map((b: WeekBucket, i) => ({
    Tuần: b.label,
    "Thực tế": ratio(actual[i].motherOutput, actual[i].motherUsed),
    "Mục tiêu": ratio(target[i].expectedMotherOutput, target[i].inputMotherQuantity),
  }));
  const finishedData = buckets.map((b: WeekBucket, i) => ({
    Tuần: b.label,
    "Thực tế": ratio(actual[i].finishedOutput, actual[i].motherUsed),
    "Mục tiêu": ratio(target[i].expectedFinishedOutput, target[i].inputMotherQuantity),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ lệ nhân mẫu mẹ — thực tế so với mục tiêu</CardTitle>
          <p className="text-sm text-text-secondary">Số cụm M05 tạo ra / số cụm mẫu mẹ đã sử dụng, theo {HISTORY_WEEKS} tuần gần nhất</p>
        </CardHeader>
        <CardContent>
          <ReportLineChart
            data={motherData}
            xKey="Tuần"
            series={[
              { key: "Thực tế", label: "Thực tế", color: "#2a78d6" },
              { key: "Mục tiêu", label: "Mục tiêu", color: "#898781" },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ lệ ra thành phẩm — thực tế so với mục tiêu</CardTitle>
          <p className="text-sm text-text-secondary">Số cây T01+T05 tạo ra / số cụm mẫu mẹ đã sử dụng, theo {HISTORY_WEEKS} tuần gần nhất</p>
        </CardHeader>
        <CardContent>
          <ReportLineChart
            data={finishedData}
            xKey="Tuần"
            series={[
              { key: "Thực tế", label: "Thực tế", color: "#0ca30c" },
              { key: "Mục tiêu", label: "Mục tiêu", color: "#898781" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
