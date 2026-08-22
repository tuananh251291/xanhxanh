import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { getStaffTaskProgressToday } from "@/lib/task-assignment";

export default async function TaskProgressPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/task-progress"))) redirect("/dashboard");

  const canView = role === "QUAN_LY_KHO_THANH_PHAM" || role === "ADMIN" || role === "SUPER_ADMIN";
  if (!canView) redirect("/dashboard");

  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
  const progress = await getStaffTaskProgressToday(workplaceWarehouseId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary-strong" /> Theo dõi tiến độ hôm nay
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tiến độ hoàn thành nhiệm vụ trong ngày của từng NV kho thành phẩm — xem chi tiết/giao việc tại{" "}
          <Link href="/task-assignment" className="text-primary-strong underline underline-offset-2">Phân công nhiệm vụ ngày</Link>.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV</th>
                  <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Đang chờ</th>
                  <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Đã hoàn thành hôm nay</th>
                  <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Tỉ lệ</th>
                </tr>
              </thead>
              <tbody>
                {progress.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-text-muted">Chưa có NV kho thành phẩm nào</td></tr>
                ) : (
                  progress.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 text-foreground">{p.name} <span className="font-mono text-xs text-text-muted">({p.code})</span></td>
                      <td className="px-4 py-3 text-right">
                        {p.pending > 0 ? <Badge className="bg-warning-light text-warning-foreground">{p.pending}</Badge> : <span className="text-text-muted">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.completedToday > 0 ? <Badge variant="completed">{p.completedToday}</Badge> : <span className="text-text-muted">0</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-text-secondary">{p.percent === null ? "—" : `${p.percent}%`}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
