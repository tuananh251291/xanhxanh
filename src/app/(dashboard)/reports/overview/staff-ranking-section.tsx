import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWeekBuckets } from "@/lib/report-utils";
import ReportBarChart from "../charts/report-bar-chart";

const HISTORY_WEEKS = 10;

type Totals = { motherUsed: number; motherOutput: number; finishedOutput: number };
const ratio = (output: number, used: number) => Math.round((output / used) * 100) / 100;
const fmtRatio = (v: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Xếp hạng NV cấy mô theo tỉ lệ (không theo tổng sản lượng thô như leaderboard tuần hiện tại ở
// /api/leaderboard/weekly — tỉ lệ mới phản ánh đúng hiệu suất, không ưu ái NV được cấp nhiều mẫu mẹ hơn).
// showPlantTypes: thêm bảng chi tiết tỉ lệ theo từng loại cây của mỗi NV — CHỈ truyền true cho Admin kỹ
// thuật (xem reports/overview/page.tsx), vai trò khác chỉ thấy biểu đồ tổng.
export default async function StaffRankingSection({ warehouseId, showPlantTypes = false }: { warehouseId: string | null; showPlantTypes?: boolean }) {
  const buckets = getWeekBuckets(HISTORY_WEEKS);

  const records = await prisma.dailyRecord.findMany({
    where: {
      recordDate: { gte: buckets[0].start },
      ...(warehouseId ? { staff: { workplaceWarehouseId: warehouseId } } : {}),
    },
    select: {
      staffId: true,
      staff: { select: { name: true } },
      motherUsed: true,
      items: { select: { stage: true, quantityCreated: true } },
      // Loại cây theo chỉ định của nhật ký — mẫu mẹ dùng (motherUsed) chỉ gắn ở cấp nhật ký/chỉ định, nên
      // tách tỉ lệ theo loại cây phải đi qua chỉ định, không qua lô đầu ra.
      instruction: { select: { plantType: { select: { code: true, name: true } } } },
    },
  });

  const byStaff = new Map<string, { name: string; byPlantType: Map<string, { name: string } & Totals> } & Totals>();
  for (const rec of records) {
    if (!byStaff.has(rec.staffId)) byStaff.set(rec.staffId, { name: rec.staff.name, motherUsed: 0, motherOutput: 0, finishedOutput: 0, byPlantType: new Map() });
    const entry = byStaff.get(rec.staffId)!;
    const pt = rec.instruction.plantType;
    if (!entry.byPlantType.has(pt.code)) entry.byPlantType.set(pt.code, { name: pt.name, motherUsed: 0, motherOutput: 0, finishedOutput: 0 });
    const ptEntry = entry.byPlantType.get(pt.code)!;
    entry.motherUsed += rec.motherUsed;
    ptEntry.motherUsed += rec.motherUsed;
    for (const item of rec.items) {
      const key = item.stage === "MAU_ME" ? "motherOutput" : "finishedOutput";
      entry[key] += item.quantityCreated;
      ptEntry[key] += item.quantityCreated;
    }
  }

  const ranked = Array.from(byStaff.values())
    .filter((e) => e.motherUsed > 0)
    .map((e) => ({ ...e, motherRatio: ratio(e.motherOutput, e.motherUsed), finishedRatio: ratio(e.finishedOutput, e.motherUsed) }))
    .sort((a, b) => b.finishedRatio - a.finishedRatio);

  // Hiện dạng hệ số (VD 1,8), không quy đổi ra % — cùng quy ước fmtRatio ở instructions/[id]/page.tsx.
  const data = ranked.map((e) => ({
    "Nhân viên": e.name,
    "Tỉ lệ nhân MM": e.motherRatio,
    "Tỉ lệ ra TP": e.finishedRatio,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Xếp hạng NV cấy mô theo tỉ lệ</CardTitle>
        <p className="text-sm text-text-secondary">Tính theo {HISTORY_WEEKS} tuần gần nhất, sắp xếp theo tỉ lệ ra thành phẩm giảm dần</p>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {showPlantTypes && ranked.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">Chi tiết theo loại cây</p>
            <div className="overflow-x-auto rounded-lg border border-divider">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-3 py-2 text-base font-bold text-primary-strong">#</th>
                    <th className="text-left px-3 py-2 text-base font-bold text-primary-strong">Nhân viên</th>
                    <th className="text-left px-3 py-2 text-base font-bold text-primary-strong">Loại cây</th>
                    <th className="text-right px-3 py-2 text-base font-bold text-primary-strong">MM dùng</th>
                    <th className="text-right px-3 py-2 text-base font-bold text-primary-strong">Tỉ lệ nhân MM</th>
                    <th className="text-right px-3 py-2 text-base font-bold text-primary-strong">Tỉ lệ ra TP</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((e, idx) => {
                    const plantRows = Array.from(e.byPlantType.entries())
                      .filter(([, p]) => p.motherUsed > 0)
                      .sort((a, b) => b[1].motherUsed - a[1].motherUsed);
                    return plantRows.map(([code, p], i) => (
                      <tr key={`${e.name}-${code}`} className={`border-divider ${i === plantRows.length - 1 ? "border-b" : ""}`}>
                        {i === 0 && (
                          <>
                            <td rowSpan={plantRows.length} className="px-3 py-1.5 align-top text-text-muted">{idx + 1}</td>
                            <td rowSpan={plantRows.length} className="px-3 py-1.5 align-top font-medium text-foreground">
                              {e.name}
                              <p className="text-xs font-normal text-text-secondary">
                                Chung: nhân MM {fmtRatio(e.motherRatio)} · ra TP {fmtRatio(e.finishedRatio)}
                              </p>
                            </td>
                          </>
                        )}
                        <td className="px-3 py-1.5 text-foreground"><span className="font-mono">{code}</span> <span className="text-text-secondary">{p.name}</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.motherUsed.toLocaleString("vi-VN")}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtRatio(ratio(p.motherOutput, p.motherUsed))}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtRatio(ratio(p.finishedOutput, p.motherUsed))}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
