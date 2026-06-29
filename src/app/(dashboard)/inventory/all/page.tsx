import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Warehouse, Moon, Sun, Package } from "lucide-react";

const WAREHOUSE_TYPE_ICONS = {
  PHONG_TOI: Moon,
  KHO_SANG: Sun,
  KHO_THANH_PHAM: Package,
};

const WAREHOUSE_TYPE_LABELS = {
  PHONG_TOI: "Phòng tối",
  KHO_SANG: "Kho sáng",
  KHO_THANH_PHAM: "Kho thành phẩm",
};

const WAREHOUSE_TYPE_COLORS = {
  PHONG_TOI: "bg-indigo-50 border-indigo-200",
  KHO_SANG: "bg-yellow-50 border-yellow-200",
  KHO_THANH_PHAM: "bg-green-50 border-green-200",
};

export default async function AllInventoryPage() {
  const session = await auth();
  const role = session?.user?.role;
  if (!["ADMIN", "DIEU_PHOI"].includes(role ?? "")) redirect("/dashboard");

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true },
    include: {
      shelves: {
        where: { isActive: true },
        include: {
          lots: {
            where: { status: "ACTIVE" },
            select: { id: true, stage: true, quantity: true, plantTypeId: true, plantType: { select: { name: true, code: true } } },
          },
        },
      },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  const grouped = warehouses.reduce<Record<string, typeof warehouses>>((acc, w) => {
    if (!acc[w.type]) acc[w.type] = [];
    acc[w.type].push(w);
    return acc;
  }, {});

  const allLots = warehouses.flatMap((w) => w.shelves.flatMap((s) => s.lots));
  const totalMother = allLots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
  const totalFinished = allLots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);

  const byType = warehouses.reduce<Record<string, { name: string; mother: number; finished: number }>>((acc, w) => {
    const lots = w.shelves.flatMap((s) => s.lots);
    for (const lot of lots) {
      const key = lot.plantTypeId;
      if (!acc[key]) acc[key] = { name: `${lot.plantType.name} (${lot.plantType.code})`, mother: 0, finished: 0 };
      if (lot.stage === "MAU_ME") acc[key].mother += lot.quantity;
      else acc[key].finished += lot.quantity;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Warehouse className="w-6 h-6 text-orange-500" /> Tồn kho tổng hợp
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Tất cả kho · {allLots.length} lô · MM: {totalMother.toLocaleString("vi-VN")} · TP: {totalFinished.toLocaleString("vi-VN")}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["PHONG_TOI", "KHO_SANG", "KHO_THANH_PHAM"] as const).map((type) => {
          const ws = grouped[type] ?? [];
          const lots = ws.flatMap((w) => w.shelves.flatMap((s) => s.lots));
          const mother = lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
          const finished = lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);
          const Icon = WAREHOUSE_TYPE_ICONS[type];
          return (
            <Card key={type} className={`border ${WAREHOUSE_TYPE_COLORS[type]}`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-5 h-5" />
                  <span className="font-semibold">{WAREHOUSE_TYPE_LABELS[type]}</span>
                  <Badge variant="secondary">{ws.length} kho</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  {mother > 0 && <p>Mẫu mẹ: <strong>{mother.toLocaleString("vi-VN")}</strong></p>}
                  {finished > 0 && <p>Thành phẩm: <strong>{finished.toLocaleString("vi-VN")}</strong></p>}
                  {lots.length === 0 && <p className="text-gray-400">Trống</p>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* By plant type */}
      {Object.keys(byType).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Theo loại cây</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium text-gray-600">Loại cây</th>
                    <th className="text-right py-2 font-medium text-gray-600">Mẫu mẹ</th>
                    <th className="text-right py-2 font-medium text-gray-600">Thành phẩm</th>
                    <th className="text-right py-2 font-medium text-gray-600">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(byType).map((entry) => (
                    <tr key={entry.name} className="border-b hover:bg-gray-50">
                      <td className="py-2 font-medium">{entry.name}</td>
                      <td className="py-2 text-right text-purple-700">{entry.mother > 0 ? entry.mother.toLocaleString("vi-VN") : "—"}</td>
                      <td className="py-2 text-right text-green-700">{entry.finished > 0 ? entry.finished.toLocaleString("vi-VN") : "—"}</td>
                      <td className="py-2 text-right font-semibold">{(entry.mother + entry.finished).toLocaleString("vi-VN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per warehouse detail */}
      {(["PHONG_TOI", "KHO_SANG", "KHO_THANH_PHAM"] as const).map((type) => {
        const ws = grouped[type];
        if (!ws?.length) return null;
        return (
          <div key={type} className="space-y-3">
            <h2 className="text-base font-semibold text-gray-700">{WAREHOUSE_TYPE_LABELS[type]}</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {ws.map((w) => {
                const lots = w.shelves.flatMap((s) => s.lots);
                const mother = lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
                const finished = lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);
                return (
                  <Card key={w.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{w.name}</p>
                          <p className="text-xs text-gray-400">{w.shelves.length} kệ · {lots.length} lô</p>
                        </div>
                        <div className="text-right text-sm space-y-0.5">
                          {mother > 0 && <p className="text-purple-700">MM: {mother.toLocaleString("vi-VN")}</p>}
                          {finished > 0 && <p className="text-green-700">TP: {finished.toLocaleString("vi-VN")}</p>}
                          {lots.length === 0 && <p className="text-gray-400">Trống</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
