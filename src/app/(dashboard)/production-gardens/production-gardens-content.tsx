import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Sprout } from "lucide-react";
import ProductionGardenDialog from "./production-garden-dialog";
import DeleteProductionGardenButton from "./delete-production-garden-button";

export default async function ProductionGardensContent() {
  const [gardens, managers] = await Promise.all([
    prisma.productionGarden.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      include: { manager: { select: { id: true, code: true, name: true } } },
    }),
    prisma.user.findMany({
      where: { role: "NHAN_VIEN_QUAN_LY_VUON", isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sprout className="w-6 h-6 text-secondary-foreground" /> Vườn sản xuất
          </h1>
          <p className="text-text-secondary text-sm mt-1">{gardens.length} vườn sản xuất</p>
        </div>
        <ProductionGardenDialog managers={managers} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã vườn</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên vườn</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Địa chỉ</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Quản lý vườn</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {gardens.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-text-muted">Chưa có Vườn sản xuất nào</td></tr>
                ) : gardens.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{g.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{g.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{g.address}</td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {g.manager ? `${g.manager.name} (${g.manager.code})` : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <ProductionGardenDialog
                          item={{ id: g.id, code: g.code, name: g.name, address: g.address, managerId: g.managerId }}
                          managers={managers}
                        />
                        <DeleteProductionGardenButton id={g.id} code={g.code} name={g.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
