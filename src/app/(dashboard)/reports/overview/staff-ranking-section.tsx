import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets } from "@/lib/report-utils";
import ReportBarChart from "../charts/report-bar-chart";

const HISTORY_WEEKS = 10;

// Xếp hạng NV cấy mô theo tỉ lệ (không theo tổng sản lượng thô như leaderboard tuần hiện tại ở
// /api/leaderboard/weekly — tỉ lệ mới phản ánh đúng hiệu suất, không ưu ái NV được cấp nhiều mẫu mẹ hơn).
export default async function StaffRankingSection() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const records = await prisma.dailyRecord.findMany({
    where: { recordDate: { gte: buckets[0].start } },
    select: {
      staffId: true,
      staff: { select: { name: true } },
      motherUsed: true,
      items: { select: { stage: true, quantityCreated: true } },
    },
  });

  const byStaff = new Map<string, { name: string; motherUsed: number; motherOutput: number; finishedOutput: number }>();
  for (const rec of records) {
    if (!byStaff.has(rec.staffId)) byStaff.set(rec.staffId, { name: rec.staff.name, motherUsed: 0, motherOutput: 0, finishedOutput: 0 });
    const entry = byStaff.get(rec.staffId)!;
    entry.motherUsed += rec.motherUsed;
    for (const item of rec.items) {
      if (item.stage === "MAU_ME") entry.motherOutput += item.quantityCreated;
      else entry.finishedOutput += item.quantityCreated;
    }
  }

  // Hiện dạng hệ số (VD 1,8), không quy đổi ra % — cùng quy ước fmtRatio ở instructions/[id]/page.tsx.
  const data = Array.from(byStaff.values())
    .filter((e) => e.motherUsed > 0)
    .map((e) => ({
      "Nhân viên": e.name,
      "Tỉ lệ nhân MM": Math.round((e.motherOutput / e.motherUsed) * 100) / 100,
      "Tỉ lệ ra TP": Math.round((e.finishedOutput / e.motherUsed) * 100) / 100,
    }))
    .sort((a, b) => b["Tỉ lệ ra TP"] - a["Tỉ lệ ra TP"]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Xếp hạng NV cấy mô theo tỉ lệ</CardTitle>
        <p className="text-sm text-text-secondary">Tính theo {HISTORY_WEEKS} tuần gần nhất, sắp xếp theo tỉ lệ ra thành phẩm giảm dần</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <ReportBarChart
            data={data}
            xKey="Nhân viên"
            series={[
              { key: "Tỉ lệ nhân MM", label: "Tỉ lệ nhân MM", color: "#2a78d6" },
              { key: "Tỉ lệ ra TP", label: "Tỉ lệ ra TP", color: "#0ca30c" },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
