import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageOpen } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import { MARKET_LABELS } from "@/types";
import ShipOrderButton from "./ship-order-button";

export default async function OrdersPackPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders/pack"))) redirect("/dashboard");

  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { confirmedAt: "asc" },
    include: {
      sale: { select: { name: true } },
      items: {
        include: {
          lot: { select: { stageCode: true } },
          processingRequest: { select: { status: true, deductQuantity: true, surplusQuantity: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageOpen className="w-6 h-6 text-primary-strong" /> Sắp đơn hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đơn đã được Sale xác nhận, chờ đóng gói — hoàn thành Yêu cầu xử lý cây (nếu có) tại trang{" "}
          <Link href="/processing" className="text-primary-strong underline underline-offset-2">Xử lý cây</Link>{" "}
          trước, sau đó bấm "Xuất kho" để trừ tồn thực tế và hoàn tất đơn.
        </p>
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">Không có đơn nào đang chờ đóng gói</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const pendingCount = order.items.filter((i) => i.processingRequest?.status === "PENDING").length;
            const totalQuantity = order.items.reduce((s, i) => s + i.quantity, 0);
            return (
              <Card key={order.id}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground font-mono">{order.code}</p>
                      <p className="text-xs text-text-secondary">
                        {order.customerCode} · {MARKET_LABELS[order.market]} · NV {order.sale.name} ·{" "}
                        {totalQuantity.toLocaleString("vi-VN")} cây
                        {order.confirmedAt && ` · Xác nhận lúc ${order.confirmedAt.toLocaleString("vi-VN")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {pendingCount > 0 && (
                        <span className="text-xs text-warning-foreground">
                          Còn {pendingCount} yêu cầu xử lý cây chưa hoàn thành
                        </span>
                      )}
                      <ShipOrderButton orderId={order.id} disabled={pendingCount > 0} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <Badge
                        key={item.id}
                        variant={
                          !item.processingRequest ? "outline" : item.processingRequest.status === "COMPLETED" ? "completed" : "in-progress"
                        }
                      >
                        {item.lot.stageCode} · {item.quantity.toLocaleString("vi-VN")} cây
                        {item.processingRequest && (item.processingRequest.status === "COMPLETED" ? " · đã xử lý" : " · chờ tách túi")}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
