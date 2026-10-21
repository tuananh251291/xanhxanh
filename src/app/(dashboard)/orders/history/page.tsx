import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, History, Eye, Search } from "lucide-react";
import { canAccessOrderPages, isAdminRole, orderMarketLabel } from "@/types";

// Lịch sử đơn ĐÃ XUẤT KHO (SHIPPED) — Quản lý kho thành phẩm (và Admin) xem theo tháng xuất (shippedAt, giờ VN).
// Mặc định tháng hiện tại. Bấm mã đơn mở chi tiết /orders/list/[id].
const vnMonthNow = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }).slice(0, 7);
const fmt = (d: Date | null) =>
  d ? d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default async function ShippedOrdersHistoryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canAccessOrderPages(role) || !(role === "QUAN_LY_KHO_THANH_PHAM" || isAdminRole(role))) redirect("/dashboard");

  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : vnMonthNow();
  const [y, m] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00+07:00`);
  const nextMonth = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const end = new Date(`${nextMonth}-01T00:00:00+07:00`);

  const orders = await prisma.order.findMany({
    where: { status: "SHIPPED", shippedAt: { gte: start, lt: end } },
    orderBy: { shippedAt: "desc" },
    select: {
      id: true, code: true, exportCode: true, customerCode: true, market: true, salesMarket: { select: { name: true } }, confirmedAt: true, shippedAt: true,
      sale: { select: { code: true, name: true } },
      assignedTo: { select: { code: true, name: true } },
      marketWarehouse: { select: { name: true } },
      // Số cây xuất = phần thật dùng cho đơn (dòng bù túi: neededQuantity, còn lại: quantity).
      items: { select: { quantity: true, neededQuantity: true } },
    },
  });
  const qtyOf = (o: (typeof orders)[number]) => o.items.reduce((s, i) => s + (i.neededQuantity ?? i.quantity), 0);
  const totalQty = orders.reduce((s, o) => s + qtyOf(o), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-foreground mb-2">
          <ArrowLeft className="w-4 h-4" /> Quay lại
        </Link>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <History className="w-6 h-6 text-primary-strong" /> Lịch sử đơn đã xuất
        </h1>
        <p className="text-text-secondary text-sm mt-1">Đơn hàng đã xuất kho, lọc theo tháng xuất.</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tháng xuất</Label>
              <Input type="month" name="month" defaultValue={month} className="w-44" />
            </div>
            <Button type="submit" size="sm" className="bg-primary hover:bg-primary-hover">
              <Search className="w-4 h-4 mr-1" /> Xem
            </Button>
            <p className="text-sm text-text-secondary ml-auto">
              Tháng {m}/{y}: <b className="text-foreground">{orders.length.toLocaleString("vi-VN")}</b> đơn ·{" "}
              <b className="text-foreground">{totalQty.toLocaleString("vi-VN")}</b> cây
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <p className="py-16 text-center text-text-muted">Không có đơn nào xuất kho trong tháng {m}/{y}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã đơn</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Khách hàng</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV bán hàng</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">NV kho xử lý</th>
                    <th className="text-right px-4 py-3 text-base text-primary-strong font-bold">Số cây</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Xác nhận</th>
                    <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Xuất kho</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 even:bg-primary-light/30 hover:bg-primary-light/60">
                      <td className="px-4 py-3 font-mono text-info-foreground">
                        {o.code}
                        {o.exportCode && <div className="text-xs text-text-muted font-sans">XK: {o.exportCode}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {o.marketWarehouse ? o.marketWarehouse.name : o.customerCode}
                        <div className="text-xs text-text-muted">{orderMarketLabel(o)}</div>
                      </td>
                      <td className="px-4 py-3">{o.sale.name} <span className="text-xs text-text-muted font-mono">{o.sale.code}</span></td>
                      <td className="px-4 py-3">{o.assignedTo ? `${o.assignedTo.name} (${o.assignedTo.code})` : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{qtyOf(o).toLocaleString("vi-VN")}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{fmt(o.confirmedAt)}</td>
                      <td className="px-4 py-3 text-text-secondary whitespace-nowrap">{fmt(o.shippedAt)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/orders/list/${o.id}`}>
                          <Button size="sm" variant="outline" className="h-8"><Eye className="w-3.5 h-3.5 mr-1.5" /> Chi tiết</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
