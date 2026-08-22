import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PackageOpen, ListChecks } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import { MARKET_LABELS } from "@/types";
import ShipOrderButton from "./ship-order-button";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";

export default async function OrdersPackPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders/pack"))) redirect("/dashboard");

  const canAssign = role === "QUAN_LY_KHO_THANH_PHAM" || role === "ADMIN" || role === "SUPER_ADMIN";
  // NV kho thành phẩm thường chỉ thấy đơn ĐÃ được Quản lý kho thành phẩm phân công cho đúng mình — Quản
  // lý/Admin vẫn thấy mọi đơn đang chờ đóng gói như cũ (họ mới là người phân công, cần thấy hết để gán).
  const onlyMyAssigned = role === "KHO_THANH_PHAM";

  const [orders, staffUsers] = await Promise.all([
    prisma.order.findMany({
      where: {
        status: "CONFIRMED",
        ...(onlyMyAssigned ? { assignedToId: session?.user?.id } : {}),
      },
      orderBy: { confirmedAt: "asc" },
      include: {
        sale: { select: { name: true } },
        items: {
          include: {
            lot: { select: { stageCode: true } },
            processingRequest: { select: { status: true, deductQuantity: true, surplusQuantity: true } },
          },
        },
        assignedTo: { select: { id: true, code: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "KHO_THANH_PHAM" },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageOpen className="w-6 h-6 text-primary-strong" /> Sắp xếp đơn hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {onlyMyAssigned
            ? "Đơn đã được Quản lý kho thành phẩm phân công cho bạn — hoàn thành Yêu cầu xử lý cây (nếu có) tại trang "
            : "Đơn đã được Sale xác nhận, chờ đóng gói — hoàn thành Yêu cầu xử lý cây (nếu có) tại trang "}
          <Link href="/processing" className="text-primary-strong underline underline-offset-2">Xử lý cây</Link>{" "}
          trước, sau đó bấm &quot;Xuất kho&quot; để trừ tồn thực tế và hoàn tất đơn.
        </p>
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">
          {onlyMyAssigned ? "Bạn chưa được phân công đơn hàng nào" : "Không có đơn nào đang chờ đóng gói"}
        </CardContent></Card>
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
                      <KhoTpAssignCell
                        endpoint={`/api/orders/${order.id}`}
                        assignedTo={order.assignedTo}
                        staffOptions={staffUsers}
                        canAssign={canAssign}
                      />
                      <Link href={`/orders/pack/${order.id}`}>
                        <Button size="sm" variant="outline" className="h-8">
                          <ListChecks className="w-3.5 h-3.5 mr-1.5" /> Nhặt hàng
                        </Button>
                      </Link>
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
