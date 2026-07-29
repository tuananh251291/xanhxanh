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

// 2 biểu đồ tỉ lệ nhiễm — theo NV cấy mô (cùng cách tính với /reports tab "Tỉ lệ nhiễm", xem
// contamination-report.tsx, lặp lại truy vấn ở đây để trang tổng quan này độc lập, không phải chờ tab
// kia render) và theo mã cây (mới, giúp phát hiện giống cây nào đang nhiễm bất thường bất kể NV nào cấy).
export default async function ContaminationBreakdownSection() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const [producedItems, contamRecords] = await Promise.all([
    prisma.dailyRecordItem.findMany({
      where: { stage: "MAU_ME", dailyRecord: { recordDate: { gte: buckets[0].start } } },
      select: {
        quantityCreated: true,
        lot: { select: { plantType: { select: { code: true } } } },
        dailyRecord: { select: { instruction: { select: { assignedToId: true } } } },
      },
    }),
    prisma.contaminationRecord.findMany({
      where: { recordDate: { gte: buckets[0].start } },
      select: {
        quantity: true,
        lot: {
          select: {
            plantType: { select: { code: true } },
            instruction: { select: { assignedToId: true, assignedTo: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  // Theo NV cấy mô
  const byStaff = new Map<string, { name: string; produced: number; contaminated: number }>();
  for (const item of producedItems) {
    const staffId = item.dailyRecord.instruction?.assignedToId;
    if (!staffId) continue;
    if (!byStaff.has(staffId)) byStaff.set(staffId, { name: "", produced: 0, contaminated: 0 });
    byStaff.get(staffId)!.produced += item.quantityCreated;
  }
  for (const rec of contamRecords) {
    const staffId = rec.lot.instruction?.assignedToId;
    if (!staffId) continue;
    if (!byStaff.has(staffId)) byStaff.set(staffId, { name: "", produced: 0, contaminated: 0 });
    const entry = byStaff.get(staffId)!;
    entry.contaminated += rec.quantity;
    entry.name = rec.lot.instruction?.assignedTo?.name ?? entry.name;
  }
  const staffUsers = await prisma.user.findMany({ where: { id: { in: Array.from(byStaff.keys()) } }, select: { id: true, name: true } });
  for (const u of staffUsers) {
    const entry = byStaff.get(u.id);
    if (entry && !entry.name) entry.name = u.name;
  }
  const staffData = Array.from(byStaff.values())
    .filter((e) => e.produced > 0)
    .map((e) => ({ "Nhân viên": e.name, "Tỉ lệ nhiễm": Math.round((e.contaminated / e.produced) * 1000) / 10 }))
    .sort((a, b) => b["Tỉ lệ nhiễm"] - a["Tỉ lệ nhiễm"]);

  // Theo mã cây
  const byPlantType = new Map<string, { produced: number; contaminated: number }>();
  for (const item of producedItems) {
    const code = item.lot.plantType.code;
    if (!byPlantType.has(code)) byPlantType.set(code, { produced: 0, contaminated: 0 });
    byPlantType.get(code)!.produced += item.quantityCreated;
  }
  for (const rec of contamRecords) {
    const code = rec.lot.plantType?.code;
    if (!code) continue;
    if (!byPlantType.has(code)) byPlantType.set(code, { produced: 0, contaminated: 0 });
    byPlantType.get(code)!.contaminated += rec.quantity;
  }
  const plantTypeData = Array.from(byPlantType.entries())
    .filter(([, v]) => v.produced > 0)
    .map(([code, v]) => ({ "Mã cây": code, "Tỉ lệ nhiễm": Math.round((v.contaminated / v.produced) * 1000) / 10 }))
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
