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

  // Phòng tối cá nhân giờ là 1 Room/NV cấy mô — liệt kê theo TỪNG kho sản xuất (không theo từng
  // phòng riêng lẻ nữa), mỗi kho có thể có rất nhiều phòng tối cá nhân bên trong.
  const warehouses = await prisma.warehouse.findMany({
    where: {
      type: "SAN_XUAT",
      isActive: true,
      ...(workplaceWarehouseId ? { id: workplaceWarehouseId } : {}),
      rooms: { some: { type: "PHONG_TOI", isActive: true } },
    },
    include: {
      _count: { select: { rooms: { where: { type: "PHONG_TOI", isActive: true } } } },
    },
    orderBy: { name: "asc" },
  });

  // Chỉ có đúng 1 kho phù hợp (NV bị giới hạn 1 kho, hoặc hệ thống chỉ có 1 kho sản xuất) — vào thẳng
  // trang danh sách phòng tối cá nhân của kho đó luôn, khỏi qua bước chọn dư thừa.
  if (warehouses.length === 1) redirect(`/inventory/phong-toi/${warehouses[0].id}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Moon className="w-6 h-6 text-primary-strong" /> Phòng tối
        </h1>
        <p className="text-text-secondary text-sm mt-1">Phòng tối của các kho sản xuất — mỗi nhân viên cấy mô có 1 phòng tối riêng</p>
      </div>

      {warehouses.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-text-muted">
          <Moon className="w-10 h-10 mx-auto mb-3 text-text-muted" />
          <p>Chưa có phòng tối nào</p>
        </CardContent></Card>
      ) : (
        <Card className="max-w-xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Kho sản xuất</th>
                  <th className="text-left px-4 py-3 text-primary-strong font-bold text-base">Số phòng tối cá nhân</th>
                  <th className="px-4 py-3 font-bold text-base"></th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((wh) => (
                  <tr key={wh.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-4 py-3 text-foreground">{wh.name} <span className="text-xs text-text-muted">({wh.code})</span></td>
                    <td className="px-4 py-3 font-medium">{wh._count.rooms}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/inventory/phong-toi/${wh.id}`}>
                        <Button size="sm" className="h-8 bg-primary hover:bg-primary-hover">
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
