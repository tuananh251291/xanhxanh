import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets, bucketIndexForDate } from "@/lib/report-utils";
import ReportBarChart from "./charts/report-bar-chart";

const HISTORY_WEEKS = 10;

export default async function PlanVsActualReport() {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const instructions = await prisma.plantingInstruction.findMany({
    where: { weekStart: { gte: buckets[0].start } },
    // Không dùng thẳng PlantingInstruction.expectedMotherOutput (cột lưu sẵn) — cột đó chỉ tính từ mẫu mẹ
    // thường lúc tạo chỉ định, KHÔNG gồm mẫu mẹ tiền ra rễ (expectedPreRootingMotherOutput, tính độc lập
    // trên CÙNG số MM sử dụng) — tự cộng gộp cả 2 ở đây để khớp đúng thực tế (actualByInstruction bên dưới
    // vốn đã là tổng của cả 2 loại, cùng logic ở /api/daily-records).
    select: { id: true, weekStart: true, items: { select: { stageCode: true, expectedMotherOutput: true, expectedPreRootingMotherOutput: true } } },
  });

  const actualItems = await prisma.dailyRecordItem.findMany({
    where: { stage: "MAU_ME", dailyRecord: { instructionId: { in: instructions.map((i) => i.id) } } },
    select: { quantityCreated: true, dailyRecord: { select: { instructionId: true } } },
  });
  const actualByInstruction = new Map<string, number>();
  for (const item of actualItems) {
    const id = item.dailyRecord.instructionId;
    actualByInstruction.set(id, (actualByInstruction.get(id) ?? 0) + item.quantityCreated);
  }

  const data = buckets.map((b) => ({ Tuần: b.label, "Dự kiến": 0, "Thực tế": 0 }));
  for (const inst of instructions) {
    if (!inst.weekStart) continue;
    const idx = bucketIndexForDate(buckets, inst.weekStart);
    if (idx === -1) continue;
    data[idx]["Dự kiến"] += inst.items
      .filter((i) => i.stageCode === "M05")
      .reduce((s, i) => s + (i.expectedMotherOutput ?? 0) + (i.expectedPreRootingMotherOutput ?? 0), 0);
    data[idx]["Thực tế"] += actualByInstruction.get(inst.id) ?? 0;
  }

  const totalPlanned = data.reduce((s, d) => s + d["Dự kiến"], 0);
  const totalActual = data.reduce((s, d) => s + d["Thực tế"], 0);
  const deviationPct = totalPlanned > 0 ? Math.round(((totalActual - totalPlanned) / totalPlanned) * 1000) / 10 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Kế hoạch vs thực tế — sản lượng mẫu mẹ ({HISTORY_WEEKS} tuần gần nhất)</CardTitle>
        <p className="text-sm text-text-secondary">
          Dự kiến: <strong>{totalPlanned.toLocaleString("vi-VN")}</strong> · Thực tế: <strong>{totalActual.toLocaleString("vi-VN")}</strong> ·
          Lệch: <strong className={Math.abs(deviationPct) > 20 ? "text-destructive" : ""}>{deviationPct > 0 ? "+" : ""}{deviationPct}%</strong>
        </p>
      </CardHeader>
      <CardContent>
        <ReportBarChart
          data={data}
          xKey="Tuần"
          series={[
            { key: "Dự kiến", label: "Dự kiến", color: "#2a78d6" },
            { key: "Thực tế", label: "Thực tế", color: "#eb6834" },
          ]}
        />
      </CardContent>
    </Card>
  );
}
