import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { MARKET_LABELS } from "@/types";
import ShipOrderButton from "@/components/shared/ship-order-button";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";
import { getOrderPackStatus } from "@/lib/order-pack-status";

// Chỉ hiện đơn CONFIRMED đã "Đã sắp xếp xong" (nhặt đủ số lượng ở /orders/pack) — đơn chưa nhặt xong
// KHÔNG xuất kho được ở đây nữa (tách hẳn 2 bước: Nhặt hàng ở /orders/pack, Xuất kho ở đây).
export default async function ShippingOrdersPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/shipping/orders"))) redirect("/dashboard");

  const canAssign = role === "QUAN_LY_KHO_THANH_PHAM" || role === "ADMIN" || role === "SUPER_ADMIN";
  const onlyMyAssigned = role === "KHO_THANH_PHAM";

  const [allOrders, staffUsers] = await Promise.all([
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
            processingRequest: { select: { status: true } },
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

  const orders = allOrders.filter((o) => getOrderPackStatus(o).variant === "completed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-primary-strong" /> Xuất đơn hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đơn đã sắp xếp xong, chờ xuất kho — bấm &quot;Xuất kho&quot; để trừ tồn thực tế và hoàn tất đơn.
        </p>
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-text-muted">
          {onlyMyAssigned ? "Bạn chưa có đơn nào đã sắp xếp xong" : "Không có đơn nào đã sắp xếp xong, chờ xuất kho"}
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
                      <p className="text-sm font-medium text-foreground font-mono flex items-center gap-2">
                        {order.code}
                        <Badge variant="completed">Đã sắp xếp xong</Badge>
                      </p>
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
                        confirmedAt={order.assignmentConfirmedAt}
                      />
                      <ShipOrderButton orderId={order.id} disabled={pendingCount > 0} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {order.items.map((item) => (
                      <Badge key={item.id} variant="completed">
                        {item.lot.stageCode} · {item.quantity.toLocaleString("vi-VN")} cây
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
