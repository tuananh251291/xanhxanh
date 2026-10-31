import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PackageCheck } from "lucide-react";
import { isPageAllowed } from "@/lib/permissions";
import { orderMarketLabel } from "@/types";
import ShipOrderButton from "@/components/shared/ship-order-button";
import KhoTpAssignCell from "@/components/shared/khotp-assign-cell";
import { getOrderPackStatus } from "@/lib/order-pack-status";

// Chi tiết đơn: gộp các dòng cùng mã cây + quy cách (nhiều lô), sắp theo mã — bảng 3 cột thẳng hàng
// Mã cây | Quy cách | Số lượng, chia nhiều khối cạnh nhau trên màn rộng cho đơn dài.
function OrderLinesGrid({ items }: { items: { quantity: number; lot: { stageCode: string | null; plantType: { code: string; name: string } } }[] }) {
  const map = new Map<string, { code: string; name: string; stage: string; qty: number }>();
  for (const i of items) {
    const stage = i.lot.stageCode ?? "—";
    const k = `${i.lot.plantType.code}|${stage}`;
    const e = map.get(k) ?? { code: i.lot.plantType.code, name: i.lot.plantType.name, stage, qty: 0 };
    e.qty += i.quantity;
    map.set(k, e);
  }
  const rows = [...map.values()].sort((a, b) => a.code.localeCompare(b.code) || a.stage.localeCompare(b.stage));
  const perCol = Math.ceil(rows.length / 3) || 1;
  const cols = rows.length > 8 ? [rows.slice(0, perCol), rows.slice(perCol, perCol * 2), rows.slice(perCol * 2)].filter((c) => c.length) : [rows];
  return (
    <div className={`grid grid-cols-1 gap-3 ${cols.length > 1 ? "lg:grid-cols-3" : ""}`}>
      {cols.map((col, ci) => (
        <table key={ci} className="w-full text-sm border border-divider rounded-lg self-start">
          <thead>
            <tr className="bg-primary-light">
              <th className="text-left px-3 py-1.5 text-base text-primary-strong font-bold">Mã cây</th>
              <th className="text-left px-3 py-1.5 text-base text-primary-strong font-bold">Quy cách</th>
              <th className="text-right px-3 py-1.5 text-base text-primary-strong font-bold">Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {col.map((r) => (
              <tr key={`${r.code}|${r.stage}`} className="border-b border-divider last:border-0">
                <td className="px-3 py-1 font-mono" title={r.name}>{r.code}</td>
                <td className="px-3 py-1 font-mono">{r.stage}</td>
                <td className="px-3 py-1 text-right tabular-nums">{r.qty.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

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
        salesMarket: { select: { name: true } },
        items: {
          include: {
            lot: { select: { stageCode: true, plantType: { select: { code: true, name: true } } } },
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
                        {order.customerCode} · {orderMarketLabel(order)} · NV {order.sale.name} ·{" "}
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
                      <ShipOrderButton orderId={order.id} orderCode={order.code} disabled={pendingCount > 0} />
                    </div>
                  </div>

                  <OrderLinesGrid items={order.items} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
