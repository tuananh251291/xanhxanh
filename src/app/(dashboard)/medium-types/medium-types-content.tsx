import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MediumTypeDialog from "./medium-type-dialog";

// Tách khỏi page.tsx để dùng lại được y hệt ở cả route gốc (/medium-types) lẫn tab "Môi trường" trong
// hub /master-data — xem plan gộp menu Admin, tránh trùng lặp logic.
export default async function MediumTypesContent() {
  const items = await prisma.mediumType.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quản lý môi trường</h1>
          <p className="text-text-secondary text-sm mt-1">{items.length} loại môi trường</p>
        </div>
        <MediumTypeDialog />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã MT</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên môi trường</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mô tả</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-info-foreground">{m.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{m.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{m.description ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={m.isActive ? "bg-primary-light text-primary-strong" : "bg-muted text-text-secondary"}>
                        {m.isActive ? "Hoạt động" : "Vô hiệu"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3"><MediumTypeDialog item={{ ...m, description: m.description ?? undefined }} /></td>
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
