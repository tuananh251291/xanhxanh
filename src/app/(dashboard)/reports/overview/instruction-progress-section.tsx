import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate } from "@/lib/report-utils";
import ReportBarChart from "../charts/report-bar-chart";
import ReportLineChart from "../charts/report-line-chart";

const HISTORY_WEEKS = 10;

// Tiến độ chỉ định theo NV kỹ thuật — đúng hạn (ENDED, endReason MOTHER_USED_UP: dùng hết mẫu mẹ đúng kế
// hoạch) so với trễ hạn (ENDED, endReason TIME_UP: hết tuần mà chưa dùng hết) so với đang thực hiện
// (ACTIVE/DRAFT) — cộng thêm xu hướng số chỉ định bị báo "cấy lệch tiến độ" (alert OUTPUT_DEVIATION,
// xem POST /api/daily-records) theo thời gian, không tách theo NV kỹ thuật vì mục đích là xu hướng
// chung, không phải xếp hạng.
export default async function InstructionProgressSection() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const [instructions, deviationAlerts] = await Promise.all([
    prisma.plantingInstruction.findMany({
      where: { weekStart: { gte: buckets[0].start } },
      select: { createdById: true, createdBy: { select: { name: true } }, status: true, endReason: true },
    }),
    prisma.alert.findMany({
      where: { type: "OUTPUT_DEVIATION", createdAt: { gte: buckets[0].start } },
      select: { createdAt: true },
    }),
  ]);

  const byStaff = new Map<string, { name: string; onTime: number; late: number; ongoing: number }>();
  for (const inst of instructions) {
    if (!byStaff.has(inst.createdById)) byStaff.set(inst.createdById, { name: inst.createdBy.name, onTime: 0, late: 0, ongoing: 0 });
    const entry = byStaff.get(inst.createdById)!;
    if (inst.status === "ENDED" && inst.endReason === "MOTHER_USED_UP") entry.onTime += 1;
    else if (inst.status === "ENDED" && inst.endReason === "TIME_UP") entry.late += 1;
    else if (inst.status === "ACTIVE" || inst.status === "DRAFT") entry.ongoing += 1;
  }
  const progressData = Array.from(byStaff.values())
    .map((e) => ({ "NV kỹ thuật": e.name, "Đúng tiến độ": e.onTime, "Trễ hạn": e.late, "Đang thực hiện": e.ongoing }))
    .sort((a, b) => (b["Đúng tiến độ"] + b["Trễ hạn"] + b["Đang thực hiện"]) - (a["Đúng tiến độ"] + a["Trễ hạn"] + a["Đang thực hiện"]));

  const deviationByWeek = buckets.map(() => 0);
  for (const alert of deviationAlerts) {
    const idx = bucketIndexForDate(buckets, alert.createdAt);
    if (idx !== -1) deviationByWeek[idx] += 1;
  }
  const deviationData = buckets.map((b, i) => ({ Tuần: b.label, "Chỉ định cấy lệch": deviationByWeek[i] }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tiến độ chỉ định theo NV kỹ thuật</CardTitle>
          <p className="text-sm text-text-secondary">Số chỉ định trong {HISTORY_WEEKS} tuần gần nhất, theo tuần thực hiện</p>
        </CardHeader>
        <CardContent>
          {progressData.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu</p>
          ) : (
            <ReportBarChart
              data={progressData}
              xKey="NV kỹ thuật"
              series={[
                { key: "Đúng tiến độ", label: "Đúng tiến độ", color: "#0ca30c" },
                { key: "Trễ hạn", label: "Trễ hạn", color: "#d03b3b" },
                { key: "Đang thực hiện", label: "Đang thực hiện", color: "#898781" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Xu hướng chỉ định cấy lệch tiến độ</CardTitle>
          <p className="text-sm text-text-secondary">Số chỉ định bị báo lệch cả 2 tỉ lệ nhân MM và ra TP so với mục tiêu, theo tuần phát sinh</p>
        </CardHeader>
        <CardContent>
          <ReportLineChart
            data={deviationData}
            xKey="Tuần"
            series={[{ key: "Chỉ định cấy lệch", label: "Chỉ định cấy lệch", color: "#d03b3b" }]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
