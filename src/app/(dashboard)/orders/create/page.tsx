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
  if (!(await isPageAllowed(role, "/orders/create"))) redirect("/dashboard");

  // Quản lý kho thành phẩm tạo/giữ đơn HỘ NV bán hàng (xem canActAsSale, src/types/index.ts) — không giới
  // hạn theo khách mình phụ trách như Sale, chỉ cần khách đã có NV bán hàng phụ trách; "Năng lực giữ đơn"
  // (holdDays) lấy theo ĐÚNG NV bán hàng đó (mỗi khách có thể khác NV, khác holdDays), không phải của
  // người quản lý đang thao tác hộ — nhúng thẳng vào từng khách để form khỏi phải tự tra thêm.
  const isActingForSale = role === "QUAN_LY_KHO_THANH_PHAM";

  const [plantTypes, customersRaw, recentOrders] = await Promise.all([
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    // Cùng 1 select cho cả 2 vai trò (khác nhau ở where) — luôn kèm holdDays của NV bán hàng phụ trách
    // (assignedTo), kể cả khi role là SALE (bằng đúng holdDays của chính họ), để form chỉ cần 1 nguồn duy
    // nhất thay vì phải phân biệt theo role.
    prisma.customer.findMany({
      where: isActingForSale ? { assignedToId: { not: null } } : { assignedToId: session?.user?.id ?? "" },
      select: { id: true, code: true, name: true, customerGroup: true, assignedTo: { select: { holdDays: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.order.findMany({
      where: isActingForSale ? { status: "HELD" } : { saleId: session?.user?.id ?? "" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, code: true, customerCode: true, market: true, status: true, holdUntil: true, createdAt: true,
        items: { select: { quantity: true } },
      },
    }),
  ]);
  const customers = customersRaw.map((c) => ({
    id: c.id, code: c.code, name: c.name, customerGroup: c.customerGroup,
    holdDays: c.assignedTo?.holdDays ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary-strong" /> {isActingForSale ? "Tạo đơn hàng (hộ NV bán hàng)" : "Đơn hàng"}
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {isActingForSale
            ? 'Tạo/giữ đơn hộ NV bán hàng đang phụ trách khách (chưa có tài khoản NCC/NV bán hàng riêng để tự nhập) — đơn vẫn tính theo Năng lực giữ đơn của đúng NV đó.'
            : 'Nhập nhu cầu khách hàng, bấm "Check" để xem đáp ứng được bao nhiêu từ tồn đạt tiêu chuẩn, rồi "Tạm giữ đơn hàng" nếu đồng ý.'}
        </p>
      </div>

      <OrderCheckForm plantTypes={plantTypes} customers={customers} />

      {recentOrders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{isActingForSale ? "Đơn đang giữ gần đây (mọi NV bán hàng)" : "Đơn gần đây của bạn"}</CardTitle></CardHeader>
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
