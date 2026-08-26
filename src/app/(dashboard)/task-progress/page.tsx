import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, ListTodo } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { getStaffTaskProgressToday, getOutstandingTasks } from "@/lib/task-assignment";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

export default async function TaskProgressPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/task-progress"))) redirect("/dashboard");

  const canView = role === "QUAN_LY_KHO_THANH_PHAM" || role === "ADMIN" || role === "SUPER_ADMIN";
  if (!canView) redirect("/dashboard");

  const workplaceWarehouseId = session?.user?.workplaceWarehouseId ?? null;
  const [progress, outstanding] = await Promise.all([
    getStaffTaskProgressToday(workplaceWarehouseId),
    getOutstandingTasks(workplaceWarehouseId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Gauge className="w-6 h-6 text-primary-strong" /> Theo dõi tiến độ công việc
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tiến độ nhiệm vụ của từng NV kho thành phẩm — xem chi tiết/giao việc tại{" "}
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
                  <th className="text-center px-4 py-3 text-base text-primary-strong font-bold w-32">Đã xác nhận</th>
                  <th className="text-center px-4 py-3 text-base text-primary-strong font-bold w-32">Đã hoàn thành</th>
                </tr>
              </thead>
              <tbody>
                {progress.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-text-muted">Chưa có NV kho thành phẩm nào</td></tr>
                ) : (
                  progress.map((p) => {
                    const acked = p.notCompleted - p.notAcked;
                    const totalToday = p.notCompleted + p.completedToday;
                    return (
                      <tr key={p.id} className="border-b last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-3 text-foreground">{p.name} <span className="font-mono text-xs text-text-muted">({p.code})</span></td>
                        <td className="px-4 py-3 text-center">
                          {p.notCompleted === 0 ? (
                            <span className="text-text-muted">—</span>
                          ) : (
                            <span className={acked === p.notCompleted ? "text-success-foreground font-medium" : "text-warning-foreground font-medium"}>
                              {acked}/{p.notCompleted}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {totalToday === 0 ? (
                            <span className="text-text-muted">—</span>
                          ) : (
                            <span className={p.completedToday === totalToday ? "text-success-foreground font-medium" : "text-warning-foreground font-medium"}>
                              {p.completedToday}/{totalToday}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ListTodo className="w-4 h-4" /> Danh sách công việc còn tồn đọng</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-light">
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Công việc</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Giao ngày</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV phụ trách</th>
                  <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {outstanding.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-text-muted">Không còn công việc nào tồn đọng</td></tr>
                ) : (
                  outstanding.map((t) => (
                    <tr key={t.key} className="border-b last:border-0 even:bg-primary-light/30">
                      <td className="px-4 py-3 text-foreground">{t.title}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{format(t.createdAt, "dd/MM/yyyy", { locale: vi })}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {t.assignedTo ? `${t.assignedTo.name} (${t.assignedTo.code})` : <span className="text-text-muted">Chưa gán</span>}
                      </td>
                      <td className="px-4 py-3">
                        {!t.assignedTo ? (
                          <span className="text-text-muted">—</span>
                        ) : t.confirmedAt ? (
                          <Badge variant="completed">Đã xác nhận</Badge>
                        ) : (
                          <Badge className="bg-warning-light text-warning-foreground">Chưa xác nhận</Badge>
                        )}
                      </td>
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
