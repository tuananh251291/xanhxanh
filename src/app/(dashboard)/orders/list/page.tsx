import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isPageAllowed } from "@/lib/permissions";
import { MARKET_LABELS } from "@/types";
import ConfirmOrderButton from "./confirm-order-button";
import CancelOrderButton from "./cancel-order-button";
import OrderDetailDialog from "./order-detail-dialog";
import type { Order, OrderItem, Lot, PlantType, OrderProcessingRequest } from "@prisma/client";

type OrderRow = Pick<Order, "id" | "code" | "customerCode" | "market" | "status" | "holdUntil" | "notes" | "createdAt"> & {
  items: (Pick<OrderItem, "id" | "quantity" | "notes"> & {
    lot: Pick<Lot, "stageCode" | "plantTypeId"> & { plantType: Pick<PlantType, "name" | "code"> };
    processingRequest: Pick<OrderProcessingRequest, "status"> | null;
  })[];
};

function OrdersTable({
  title,
  description,
  orders,
  showHoldUntil,
  showActions,
}: {
  title: string;
  description: string;
  orders: OrderRow[];
  showHoldUntil: boolean;
  showActions: boolean;
}) {
  return (
    <Card>
      <div className="px-4 pt-4">
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-text-secondary text-sm mt-0.5">{description}</p>
      </div>
      <CardContent className="p-0 mt-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-primary-light">
                <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Mã đơn</th>
                <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Khách hàng</th>
                <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Số lượng</th>
                {showHoldUntil && <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Ngày hết hạn tạm giữ</th>}
                <th className="text-left px-4 py-3 text-base text-primary-strong font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono text-text-secondary">{o.code}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{o.customerCode} · {MARKET_LABELS[o.market]}</td>
                  <td className="px-4 py-3 text-sm text-foreground">{o.items.reduce((s, i) => s + i.quantity, 0).toLocaleString("vi-VN")} cây</td>
                  {showHoldUntil && (
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {o.holdUntil ? format(o.holdUntil, "HH:mm dd/MM/yyyy", { locale: vi }) : "—"}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <OrderDetailDialog
                        code={o.code}
                        customerCode={o.customerCode}
                        market={o.market}
                        status={o.status}
                        holdUntilLabel={o.holdUntil ? format(o.holdUntil, "HH:mm dd/MM/yyyy", { locale: vi }) : "—"}
                        createdAtLabel={format(o.createdAt, "HH:mm dd/MM/yyyy", { locale: vi })}
                        notes={o.notes}
                        items={o.items.map((i) => ({
                          id: i.id,
                          plantTypeId: i.lot.plantTypeId,
                          plantTypeName: i.lot.plantType.name,
                          plantTypeCode: i.lot.plantType.code,
                          stageCode: i.lot.stageCode,
                          quantity: i.quantity,
                          notes: i.notes,
                          processingStatus: i.processingRequest?.status ?? null,
                        }))}
                      />
                      {showActions && (
                        <>
                          <ConfirmOrderButton orderId={o.id} />
                          <CancelOrderButton orderId={o.id} orderCode={o.code} />
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={showHoldUntil ? 5 : 4} className="px-4 py-8 text-center text-sm text-text-muted">Chưa có đơn hàng nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function OrdersListPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders/list"))) redirect("/dashboard");

  // Quản lý kho thành phẩm xem/quản lý HỘ mọi đơn (không chỉ đơn saleId trùng chính mình) — đơn tạo hộ
  // luôn gán saleId = NV bán hàng thật đang phụ trách khách, không phải người quản lý (xem canActAsSale,
  // POST /api/orders), nên lọc theo saleId sẽ không thấy được đơn mình vừa tạo hộ.
  const isActingForSale = role === "QUAN_LY_KHO_THANH_PHAM";
  const orders = await prisma.order.findMany({
    where: { status: { in: ["HELD", "CONFIRMED"] }, ...(isActingForSale ? {} : { saleId: session?.user?.id ?? "" }) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, code: true, customerCode: true, market: true, status: true, holdUntil: true,
      notes: true, createdAt: true,
      items: {
        select: {
          id: true, quantity: true, notes: true,
          lot: { select: { stageCode: true, plantTypeId: true, plantType: { select: { name: true, code: true } } } },
          processingRequest: { select: { status: true } },
        },
      },
    },
  });

  const heldOrders = orders.filter((o) => o.status === "HELD");
  const confirmedOrders = orders.filter((o) => o.status === "CONFIRMED");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary-strong" /> Danh sách đơn hàng
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {isActingForSale
            ? 'Mọi đơn hàng đang giữ/đã xác nhận (mọi NV bán hàng) — bấm "Xác nhận" khi khách hàng đã đồng ý mua, không thể chuyển ngược lại trạng thái Đang giữ.'
            : 'Đơn hàng bạn đã tạo — bấm "Xác nhận" khi khách hàng đã đồng ý mua, không thể chuyển ngược lại trạng thái Đang giữ.'}
        </p>
      </div>

      <OrdersTable
        title="Đơn tạm giữ"
        description="Đang giữ chỗ tồn kho — xác nhận khi khách đồng ý mua, hoặc xóa để trả lại tồn đạt tiêu chuẩn ngay."
        orders={heldOrders}
        showHoldUntil
        showActions
      />

      <OrdersTable
        title="Đơn đã xác nhận"
        description="Đã chốt với khách, chờ Kho thành phẩm xuất kho — không thể tự xóa/sửa ở bước này."
        orders={confirmedOrders}
        showHoldUntil={false}
        showActions={false}
      />
    </div>
  );
}
