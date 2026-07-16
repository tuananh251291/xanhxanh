import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, MARKET_LABELS } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import OrderCheckForm from "./order-check-form";

export default async function OrdersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders"))) redirect("/dashboard");

  const [plantTypes, recentOrders] = await Promise.all([
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.order.findMany({
      where: { saleId: session?.user?.id ?? "" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, code: true, customerCode: true, market: true, status: true, holdUntil: true, createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary-strong" /> Đơn hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Nhập nhu cầu khách hàng, bấm "Check" để xem đáp ứng được bao nhiêu từ tồn khả dụng, rồi "Tạm giữ đơn hàng" nếu đồng ý.
        </p>
      </div>

      <OrderCheckForm plantTypes={plantTypes} holdDays={session?.user?.holdDays ?? null} />

      {recentOrders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Đơn gần đây của bạn</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recentOrders.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 bg-background rounded-lg border border-divider">
                <div>
                  <p className="text-sm font-medium text-foreground font-mono">{o.code}</p>
                  <p className="text-xs text-text-secondary">
                    {o.customerCode} · {MARKET_LABELS[o.market]} · {o.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("vi-VN")} cây ·{" "}
                    {formatDistanceToNow(o.createdAt, { addSuffix: true, locale: vi })}
                  </p>
                </div>
                <Badge className={ORDER_STATUS_COLORS[o.status]}>{ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS]}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
