import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isPageAllowed } from "@/lib/permissions";
import { canViewFinishedForecast, computeFinishedForecast, toVnDateKey } from "@/lib/finished-stock-forecast";
import ForecastBoard from "./forecast-board";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// "Tồn kho dự kiến" theo ngày N = tồn thực + hàng khu sản xuất + hàng NCC − đơn chưa xuất — xem
// src/lib/finished-stock-forecast-calc.ts. Hiện chỉ để xem + đối chiếu số, chưa ảnh hưởng luồng tạo đơn.
export default async function FinishedForecastPage({ searchParams }: { searchParams: Promise<{ date?: string; warehouseId?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canViewFinishedForecast(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/inventory/du-kien"))) redirect("/dashboard");

  const sp = await searchParams;
  const todayKey = toVnDateKey(new Date());
  const dateKey = sp.date && DATE_RE.test(sp.date) && sp.date >= todayKey ? sp.date : todayKey;

  const isManager = role === "QUAN_LY_KHO_THANH_PHAM";
  const warehouses = isManager
    ? []
    : await prisma.warehouse.findMany({ where: { type: "THANH_PHAM" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const warehouseId = isManager
    ? session?.user?.workplaceWarehouseId ?? null
    : warehouses.find((w) => w.id === sp.warehouseId)?.id ?? warehouses.find((w) => /đông dư/i.test(w.name))?.id ?? warehouses[0]?.id ?? null;

  if (!warehouseId) {
    return <p className="text-sm text-text-muted">Tài khoản chưa được gán kho thành phẩm làm việc — liên hệ Admin cấp cao.</p>;
  }

  const result = await computeFinishedForecast(warehouseId, dateKey);
  const total = result.rows.reduce((s, r) => s + r.projected, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-primary-strong" /> Tồn kho dự kiến
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Tồn thực Phòng đạt tiêu chuẩn + hàng khu sản xuất + hàng NCC − đơn chưa xuất, tính đến ngày đã chọn. Hàng chưa
          đánh giá và số đăng ký sản xuất tính {result.ratePct}%. Tổng: {total.toLocaleString("vi-VN")} cây.
        </p>
      </div>

      <Card>
        <CardContent className="py-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm font-medium text-foreground">
              <span className="block">Tính đến ngày</span>
              <Input type="date" name="date" defaultValue={dateKey} min={todayKey} className="w-44" />
            </label>
            {warehouses.length > 0 && (
              <label className="space-y-1 text-sm font-medium text-foreground">
                <span className="block">Kho thành phẩm</span>
                <select name="warehouseId" defaultValue={warehouseId} className="h-8 rounded-lg border border-border bg-card px-2 text-sm">
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
            )}
            <Button type="submit" size="sm">Xem</Button>
          </form>
        </CardContent>
      </Card>

      {!result.roomFound ? (
        <p className="text-sm text-text-muted">Kho này chưa có Phòng đạt tiêu chuẩn.</p>
      ) : (
        <>
          {result.lateSupplierPlans.length > 0 && (
            <Card className="border-destructive/40">
              <CardContent className="py-4 space-y-1">
                <p className="text-sm font-semibold text-destructive">NCC quá ngày giao — không còn tính vào tồn dự kiến</p>
                {result.lateSupplierPlans.map((p) => (
                  <p key={p.code} className="text-sm text-text-secondary">
                    {p.code} · {p.supplierName} · dự kiến {p.expectedKey.split("-").reverse().join("/")} · {p.quantity.toLocaleString("vi-VN")} cây
                  </p>
                ))}
              </CardContent>
            </Card>
          )}
          <ForecastBoard rows={result.rows} />
        </>
      )}
    </div>
  );
}
