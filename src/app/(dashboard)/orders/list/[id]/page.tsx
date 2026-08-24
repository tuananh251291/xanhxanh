import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { isPageAllowed } from "@/lib/permissions";
import OrderDetailContent from "@/components/shared/order-detail-content";

// Trang chi tiết đơn hàng (thay cho popup OrderDetailDialog ở mục "Đơn đã xác nhận" — nội dung nhiều
// dòng loại cây/quy cách sau này sẽ dài, không hợp popup) — dùng chung OrderDetailContent với
// OrderDetailDialog (mục "Đơn tạm giữ" vẫn giữ dạng popup, nội dung ngắn hơn).
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders/list"))) redirect("/dashboard");

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, code: true, customerCode: true, market: true, status: true, holdUntil: true,
      notes: true, createdAt: true, saleId: true,
      items: {
        select: {
          id: true, quantity: true, notes: true,
          lot: { select: { stageCode: true, plantTypeId: true, plantType: { select: { name: true, code: true } } } },
          processingRequest: { select: { status: true } },
        },
      },
    },
  });
  if (!order) notFound();

  // Sale chỉ xem chi tiết đơn của chính mình — Quản lý kho thành phẩm/Admin xem mọi đơn (giống phạm vi
  // /orders/list, xem isActingForSale ở đó và role === "SALE" check ở /orders/[id] print page).
  if (role === "SALE" && order.saleId !== session!.user.id) redirect("/orders/list");

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/orders/list">
          <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground font-mono">{order.code}</h1>
          <p className="text-text-secondary text-sm">Chi tiết đơn hàng</p>
        </div>
        <Link href={`/orders/${order.id}`} target="_blank">
          <Button size="sm" variant="outline">
            <Printer className="w-3.5 h-3.5 mr-1.5" /> In phiếu
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <OrderDetailContent
            customerCode={order.customerCode}
            market={order.market}
            status={order.status}
            holdUntilLabel={order.holdUntil ? format(order.holdUntil, "HH:mm dd/MM/yyyy", { locale: vi }) : "—"}
            createdAtLabel={format(order.createdAt, "HH:mm dd/MM/yyyy", { locale: vi })}
            notes={order.notes}
            items={order.items.map((i) => ({
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
        </CardContent>
      </Card>
    </div>
  );
}
