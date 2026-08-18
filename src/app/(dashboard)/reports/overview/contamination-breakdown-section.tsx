import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets } from "@/lib/report-utils";
import ReportBarChart from "../charts/report-bar-chart";

const HISTORY_WEEKS = 10;
const STATUS_COLOR_THRESHOLDS = [
  { min: 20, color: "#d03b3b" }, // critical
  { min: 10, color: "#fab219" }, // warning
  { min: 0, color: "#0ca30c" }, // good
];
const PLANT_TYPE_CHART_LIMIT = 15;

// 2 biểu đồ tỉ lệ nhiễm — theo NV cấy mô và theo mã cây (giúp phát hiện giống cây nào đang nhiễm bất
// thường bất kể NV nào cấy). Nguồn dữ liệu: DailyRecord.motherChecked/motherContaminatedM05 — 2 số NV
// cấy mô tự nhập tay MỖI NGÀY lúc kiểm tra mẫu mẹ (tỉ lệ = nhiễm/đã kiểm tra), CÙNG nguồn với "Tỉ lệ
// nhiễm mẫu mẹ bàn giao" (xem mother-contamination-report.tsx). KHÔNG dùng ContaminationRecord (model
// đó theo dõi nhiễm phát hiện SAU trên kệ Kho sáng, cấp Lot, không liên quan tới nhịp kiểm tra hàng ngày
// của NV cấy mô — hiện chưa NV nào dùng luồng "Lọc nhiễm" tạo ra bản ghi này nên trước đây tính ra 0%
// vĩnh viễn dù ĐÃ có dữ liệu nhiễm thật ở DailyRecord).
export default async function ContaminationBreakdownSection() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const dailyRecords = await prisma.dailyRecord.findMany({
    where: { recordDate: { gte: buckets[0].start } },
    select: {
      staffId: true,
      motherChecked: true,
      motherContaminatedM05: true,
      instruction: { select: { plantType: { select: { code: true } } } },
    },
  });

  // Theo NV cấy mô
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
    .map((e) => ({ "Nhân viên": e.name, "Tỉ lệ nhiễm": Math.round((e.contaminated / e.checked) * 1000) / 10 }))
    .sort((a, b) => b["Tỉ lệ nhiễm"] - a["Tỉ lệ nhiễm"]);

  // Theo mã cây
  const byPlantType = new Map<string, { checked: number; contaminated: number }>();
  for (const r of dailyRecords) {
    const code = r.instruction.plantType.code;
    if (!byPlantType.has(code)) byPlantType.set(code, { checked: 0, contaminated: 0 });
    const entry = byPlantType.get(code)!;
    entry.checked += r.motherChecked;
    entry.contaminated += r.motherContaminatedM05;
  }
  const plantTypeData = Array.from(byPlantType.entries())
    .filter(([, v]) => v.checked > 0)
    .map(([code, v]) => ({ "Mã cây": code, "Tỉ lệ nhiễm": Math.round((v.contaminated / v.checked) * 1000) / 10 }))
    .sort((a, b) => b["Tỉ lệ nhiễm"] - a["Tỉ lệ nhiễm"])
    .slice(0, PLANT_TYPE_CHART_LIMIT);

  const legend = (
    <p className="text-sm text-text-secondary">
      <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#0ca30c" }} /> Tốt (&lt;10%)</span>
      <span className="inline-flex items-center gap-1 mr-3"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#fab219" }} /> Cảnh báo (10-20%)</span>
      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: "#d03b3b" }} /> Vượt ngưỡng (&gt;20%)</span>
    </p>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ lệ nhiễm theo NV cấy mô</CardTitle>
          {legend}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tỉ lệ nhiễm theo mã cây</CardTitle>
          <p className="text-sm text-text-secondary">Top {PLANT_TYPE_CHART_LIMIT} mã cây có tỉ lệ nhiễm cao nhất, {HISTORY_WEEKS} tuần gần nhất</p>
        </CardHeader>
        <CardContent>
          {plantTypeData.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu</p>
          ) : (
            <ReportBarChart
              data={plantTypeData}
              xKey="Mã cây"
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
