import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate } from "@/lib/report-utils";
import ReportLineChart from "./charts/report-line-chart";
import ReportBarChart from "./charts/report-bar-chart";
import MotherContaminationReport from "./mother-contamination-report";
import DarkRoomContaminationReport from "./dark-room-contamination-report";

const HISTORY_WEEKS = 10;
const ALERT_THRESHOLD_PCT = 20;

const STATUS_COLOR_THRESHOLDS = [
  { min: ALERT_THRESHOLD_PCT, color: "#d03b3b" }, // critical
  { min: 10, color: "#fab219" }, // warning
  { min: 0, color: "#0ca30c" }, // good
];

// Nguồn dữ liệu: DailyRecord.motherChecked/motherContaminatedM05 — 2 số NV cấy mô tự nhập tay MỖI NGÀY
// lúc kiểm tra mẫu mẹ (tỉ lệ = nhiễm/đã kiểm tra), CÙNG nguồn với "Tỉ lệ nhiễm mẫu mẹ bàn giao" (xem
// mother-contamination-report.tsx). KHÔNG dùng ContaminationRecord (model đó theo dõi nhiễm phát hiện
// SAU trên kệ Kho sáng, cấp Lot, không liên quan tới nhịp kiểm tra hàng ngày — hiện chưa NV nào dùng
// luồng "Lọc nhiễm" tạo ra bản ghi này nên trước đây tính ra 0% vĩnh viễn dù ĐÃ có dữ liệu nhiễm thật).
export default async function ContaminationReport() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const dailyRecords = await prisma.dailyRecord.findMany({
    where: { recordDate: { gte: buckets[0].start } },
    select: { recordDate: true, staffId: true, motherChecked: true, motherContaminatedM05: true },
  });

  // Xu hướng toàn hệ thống theo tuần
  const checkedByWeek = buckets.map(() => 0);
  const contamByWeek = buckets.map(() => 0);
  for (const r of dailyRecords) {
    const idx = bucketIndexForDate(buckets, r.recordDate);
    if (idx === -1) continue;
    checkedByWeek[idx] += r.motherChecked;
    contamByWeek[idx] += r.motherContaminatedM05;
  }
  const trendData = buckets.map((b, i) => ({
    Tuần: b.label,
    "Tỉ lệ nhiễm": checkedByWeek[i] > 0 ? Math.round((contamByWeek[i] / checkedByWeek[i]) * 1000) / 10 : 0,
  }));

  // Theo nhân viên cấy mô
  const byStaff = new Map<string, { name: string; checked: number; contaminated: number }>();
  for (const r of dailyRecords) {
    if (!byStaff.has(r.staffId)) byStaff.set(r.staffId, { name: "", checked: 0, contaminated: 0 });
    const entry = byStaff.get(r.staffId)!;
    entry.checked += r.motherChecked;
    entry.contaminated += r.motherContaminatedM05;
  }
  const staffUsers = await prisma.user.findMany({ where: { id: { in: Array.from(byStaff.keys()) } }, select: { id: true, name: true } });
  for (const u of staffUsers) {
    const entry = byStaff.get(u.id);
    if (entry) entry.name = u.name;
  }

  const staffData = Array.from(byStaff.values())
    .filter((e) => e.checked > 0)
    .map((e) => ({
      "Nhân viên": e.name,
      "Tỉ lệ nhiễm": Math.round((e.contaminated / e.checked) * 1000) / 10,
    }))
    // Nhiễm nhiều nhất lên đầu.
    .sort((a, b) => b["Tỉ lệ nhiễm"] - a["Tỉ lệ nhiễm"]);

  return (
    <div className="space-y-4">
      <MotherContaminationReport />
      <DarkRoomContaminationReport />

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
