import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isPageAllowed } from "@/lib/permissions";
import MediumTypeDialog from "./medium-type-dialog";

export default async function MediumTypesPage() {
  const session = await auth();
  if (!(await isPageAllowed(session?.user?.role ?? null, "/medium-types"))) redirect("/dashboard");
  const items = await prisma.mediumType.findMany({ orderBy: { code: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý môi trường</h1>
          <p className="text-gray-500 text-sm mt-1">{items.length} loại môi trường</p>
        </div>
        <MediumTypeDialog />
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-green-700">
                  <th className="text-left px-4 py-3 text-sm font-medium text-white">Mã MT</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white">Tên môi trường</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white">Mô tả</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white">Trạng thái</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-blue-700">{m.code}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{m.description ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={m.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
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
