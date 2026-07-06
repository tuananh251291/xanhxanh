import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Moon, Search } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";

export default async function PhongToiPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/phong-toi"))) redirect("/dashboard");

  // NV kho mô/cấy mô chỉ làm việc với đúng 1 kho sản xuất (nếu đã được Admin gán) — NV kỹ thuật không
  // bị giới hạn, làm việc được ở mọi kho.
  const workplaceWarehouseId = role !== "KY_THUAT" ? session?.user?.workplaceWarehouseId : null;

  const rooms = await prisma.room.findMany({
    where: {
      type: "PHONG_TOI",
      isActive: true,
      ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
    },
    include: {
      warehouse: { select: { name: true, code: true } },
    },
    orderBy: { warehouse: { name: "asc" } },
  });

  // Chỉ có đúng 1 phòng tối phù hợp (NV bị giới hạn 1 kho, hoặc hệ thống chỉ có 1 phòng tối) — vào
  // thẳng trang chi tiết luôn, khỏi qua bước chọn dư thừa.
  if (rooms.length === 1) redirect(`/inventory/phong-toi/${rooms[0].id}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Moon className="w-6 h-6 text-indigo-600" /> Phòng tối
        </h1>
        <p className="text-gray-500 text-sm mt-1">Phòng tối của các kho sản xuất — mỗi nhân viên cấy mô có 1 phòng tối riêng</p>
      </div>

      {rooms.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-gray-400">
          <Moon className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p>Chưa có phòng tối nào</p>
        </CardContent></Card>
      ) : (
        <Card className="max-w-xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="bg-green-700">
                  <th className="text-left px-4 py-3 font-medium text-white">Kho sản xuất</th>
                  <th className="text-left px-4 py-3 font-medium text-white">Phòng tối</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id} className="border-b last:border-0 even:bg-green-50 hover:bg-green-100">
                    <td className="px-4 py-3 text-gray-700">{room.warehouse.name} <span className="text-xs text-gray-400">({room.warehouse.code})</span></td>
                    <td className="px-4 py-3 font-medium">{room.name} <span className="text-xs text-gray-400 font-mono">({room.code})</span></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/inventory/phong-toi/${room.id}`}>
                        <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700">
                          <Search className="w-3.5 h-3.5 mr-1.5" /> Xem chi tiết
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
