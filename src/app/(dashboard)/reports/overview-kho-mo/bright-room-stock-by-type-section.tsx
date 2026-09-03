import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReportBarChart from "../charts/report-bar-chart";

const MAX_TYPES = 15;

// Tồn kho phòng sáng HIỆN TẠI (không phải phát sinh theo tuần) — cộng dồn Lot.quantity của các lô ACTIVE
// đang nằm trên kệ Phòng mẫu mẹ/Phòng ra rễ, gộp theo mã cây, giới hạn top MAX_TYPES mã cây nhiều nhất để
// biểu đồ không quá rối. `warehouseId` = kho sản xuất NV kho mô đang được gán (null = xem toàn hệ thống,
// dành cho Admin hoặc NV chưa được gán kho).
export default async function BrightRoomStockByTypeSection({ warehouseId }: { warehouseId: string | null }) {
  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      shelf: {
        room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } },
        ...(warehouseId ? { warehouseId } : {}),
      },
    },
    select: { quantity: true, plantType: { select: { code: true, name: true } } },
  });

  const byType = new Map<string, { name: string; quantity: number }>();
  for (const lot of lots) {
    const entry = byType.get(lot.plantType.code) ?? { name: lot.plantType.name, quantity: 0 };
    entry.quantity += lot.quantity;
    byType.set(lot.plantType.code, entry);
  }

  const data = Array.from(byType.entries())
    .map(([code, e]) => ({ "Mã cây": code, "Số lượng": e.quantity }))
    .sort((a, b) => b["Số lượng"] - a["Số lượng"])
    .slice(0, MAX_TYPES);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tồn kho phòng sáng theo mã cây</CardTitle>
        <p className="text-sm text-text-secondary">Số lượng hiện có trên kệ (mẫu mẹ + ra rễ), top {MAX_TYPES} mã cây nhiều nhất</p>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Chưa có dữ liệu</p>
        ) : (
          <ReportBarChart data={data} xKey="Mã cây" series={[{ key: "Số lượng", label: "Số lượng", color: "#2a78d6" }]} />
        )}
      </CardContent>
    </Card>
  );
}
