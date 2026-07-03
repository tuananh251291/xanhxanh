import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Leaf } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import PlantTypeDialog from "./plant-type-dialog";
import PlantTypeSpecDialog from "./plant-type-spec-dialog";

export default async function PlantTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/plant-types"))) redirect("/dashboard");

  const plants = await prisma.plantType.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý loại cây</h1>
          <p className="text-gray-500 text-sm mt-1">{plants.length} loại cây</p>
        </div>
        <PlantTypeDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Mã</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Tên cây</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Thời gian kho sáng</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Thời gian TP</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {plants.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-green-700">{p.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 flex items-center gap-2">
                      <Leaf className="w-4 h-4 text-green-500" />{p.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {p.lightRoomWeeksMin}–{p.lightRoomWeeksMax} tuần
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {p.finishedDaysMin}–{p.finishedDaysMax} ngày
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={p.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                        {p.isActive ? "Hoạt động" : "Vô hiệu"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <PlantTypeDialog plant={{ ...p, description: p.description ?? undefined }} />
                      <PlantTypeSpecDialog plantTypeId={p.id} plantTypeName={p.name} />
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
