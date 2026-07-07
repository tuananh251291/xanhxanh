import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate } from "@/lib/report-utils";
import ReportLineChart from "./charts/report-line-chart";
import ReportBarChart from "./charts/report-bar-chart";

const HISTORY_WEEKS = 10;
const ALERT_THRESHOLD_PCT = 20;

const STATUS_COLOR_THRESHOLDS = [
  { min: ALERT_THRESHOLD_PCT, color: "#d03b3b" }, // critical
  { min: 10, color: "#fab219" }, // warning
  { min: 0, color: "#0ca30c" }, // good
];

export default async function ContaminationReport() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const [producedItems, contamRecords] = await Promise.all([
    prisma.dailyRecordItem.findMany({
      where: { stage: "MAU_ME", dailyRecord: { recordDate: { gte: buckets[0].start } } },
      select: { quantityCreated: true, dailyRecord: { select: { recordDate: true, instruction: { select: { assignedToId: true } } } } },
    }),
    prisma.contaminationRecord.findMany({
      where: { recordDate: { gte: buckets[0].start } },
      select: {
        quantity: true,
        recordDate: true,
        lot: { select: { instruction: { select: { assignedToId: true, assignedTo: { select: { name: true } } } } } },
      },
    }),
  ]);

  // Xu hướng toàn hệ thống theo tuần
  const producedByWeek = buckets.map(() => 0);
  for (const item of producedItems) {
    const idx = bucketIndexForDate(buckets, item.dailyRecord.recordDate);
    if (idx !== -1) producedByWeek[idx] += item.quantityCreated;
  }
  const contamByWeek = buckets.map(() => 0);
  for (const rec of contamRecords) {
    const idx = bucketIndexForDate(buckets, rec.recordDate);
    if (idx !== -1) contamByWeek[idx] += rec.quantity;
  }
  const trendData = buckets.map((b, i) => ({
    Tuần: b.label,
    "Tỉ lệ nhiễm": producedByWeek[i] > 0 ? Math.round((contamByWeek[i] / producedByWeek[i]) * 1000) / 10 : 0,
  }));

  // Theo nhân viên cấy mô
  const producedByStaff = new Map<string, { name: string; produced: number; contaminated: number }>();
  for (const item of producedItems) {
    const staffId = item.dailyRecord.instruction?.assignedToId;
    if (!staffId) continue;
    if (!producedByStaff.has(staffId)) producedByStaff.set(staffId, { name: "", produced: 0, contaminated: 0 });
    producedByStaff.get(staffId)!.produced += item.quantityCreated;
  }
  for (const rec of contamRecords) {
    const staffId = rec.lot.instruction?.assignedToId;
    if (!staffId) continue;
    if (!producedByStaff.has(staffId)) producedByStaff.set(staffId, { name: "", produced: 0, contaminated: 0 });
    const entry = producedByStaff.get(staffId)!;
    entry.contaminated += rec.quantity;
    entry.name = rec.lot.instruction?.assignedTo?.name ?? entry.name;
  }
  const staffUsers = await prisma.user.findMany({ where: { id: { in: Array.from(producedByStaff.keys()) } }, select: { id: true, name: true } });
  for (const u of staffUsers) {
    const entry = producedByStaff.get(u.id);
    if (entry && !entry.name) entry.name = u.name;
  }

  const staffData = Array.from(producedByStaff.values())
    .filter((e) => e.produced > 0)
    .map((e) => ({
      "Nhân viên": e.name,
      "Tỉ lệ nhiễm": Math.round((e.contaminated / e.produced) * 1000) / 10,
    }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Xu hướng tỉ lệ nhiễm toàn hệ thống ({HISTORY_WEEKS} tuần gần nhất)</CardTitle>
          <p className="text-sm text-text-secondary">Ngưỡng cảnh báo hiện tại: {ALERT_THRESHOLD_PCT}%</p>
        </CardHeader>
        <CardContent>
          <ReportLineChart
            data={trendData}
            xKey="Tuần"
            unit="%"
            series={[{ key: "Tỉ lệ nhiễm", label: "Tỉ lệ nhiễm", color: "#2a78d6" }]}
            referenceValue={ALERT_THRESHOLD_PCT}
            referenceLabel="Ngưỡng 20%"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ lệ nhiễm theo nhân viên cấy mô</CardTitle>
          <p className="text-sm text-text-secondary">
            <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#0ca30c" }} /> Tốt (&lt;10%)</span>
            <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#fab219" }} /> Cảnh báo (10-20%)</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#d03b3b" }} /> Vượt ngưỡng (&gt;20%)</span>
          </p>
        </CardHeader>
        <CardContent>
          {staffData.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu</p>
          ) : (
            <ReportBarChart
              data={staffData}
              xKey="Nhân viên"
              unit="%"
              series={[{ key: "Tỉ lệ nhiễm", label: "Tỉ lệ nhiễm", color: "#2a78d6" }]}
              colorThresholds={STATUS_COLOR_THRESHOLDS}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
