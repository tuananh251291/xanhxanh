import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flag } from "lucide-react";
import { INSPECTION_LANE_LABELS, INSPECTION_LANE_COLORS } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import InspectionLaneCell from "./inspection-lane-cell";

export default async function InspectionLanePage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inspection-lane"))) redirect("/dashboard");
  // Chỉ NV kho mô mới có nghiệp vụ này — cài đặt luồng kiểm tra cho đúng NV cấy mô cùng kho sản xuất
  // mình đang làm việc.
  if (role !== "KHO_MO") redirect("/dashboard");

  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;

  if (!workplaceWarehouseId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Flag className="w-6 h-6 text-info-foreground" /> Cài đặt luồng kiểm tra
          </h1>
        </div>
        <Card><CardContent className="py-12 text-center text-text-muted">
          Bạn chưa được gán địa điểm làm việc — liên hệ Admin cao nhất để được gán trước khi sử dụng tính năng này.
        </CardContent></Card>
      </div>
    );
  }

  const staff = await prisma.user.findMany({
    where: { role: "CAY_MO", workplaceWarehouseId },
    select: { id: true, code: true, name: true, email: true, inspectionLane: true },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Flag className="w-6 h-6 text-info-foreground" /> Cài đặt luồng kiểm tra
        </h1>
        <p className="text-text-secondary text-sm mt-1">{staff.length} nhân viên cấy mô thuộc kho sản xuất bạn đang làm việc</p>
      </div>

      {staff.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">
          Chưa có nhân viên cấy mô nào thuộc kho sản xuất này
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã NV</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Tên NV</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Luồng hiện tại</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Cài đặt</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((u) => (
                    <tr key={u.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60 transition-colors">
                      <td className="px-4 py-3 text-sm font-mono text-foreground">{u.code}</td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{u.name}</td>
                      <td className="px-4 py-3">
                        {u.inspectionLane ? (
                          <Badge className={INSPECTION_LANE_COLORS[u.inspectionLane]}>{INSPECTION_LANE_LABELS[u.inspectionLane]}</Badge>
                        ) : (
                          <Badge variant="secondary">Chưa cài đặt</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <InspectionLaneCell userId={u.id} currentLane={u.inspectionLane} />
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
