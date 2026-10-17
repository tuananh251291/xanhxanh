import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ListChecks } from "lucide-react";
import Link from "next/link";
import { isPageAllowed } from "@/lib/permissions";
import { isAdminRole, isKhoThanhPhamRole, MARKET_LABELS } from "@/types";
import OrderPickTable from "./order-pick-table";
import OrderEditDialog from "@/components/shared/order-edit-dialog";
import { canEditOrderItems } from "@/lib/order-edit";

export default async function OrderPickPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/orders/pack"))) redirect("/dashboard");

  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      sale: { select: { name: true } },
      assignedTo: { select: { name: true, code: true } },
      items: {
        include: {
          lot: { select: { code: true, stageCode: true, plantType: { select: { code: true, name: true } } } },
        },
      },
    },
  });
  if (!order) notFound();

  // NV kho thành phẩm thường chỉ được vào chi tiết đơn ĐÃ giao cho chính mình (khớp phạm vi danh sách ở
  // /orders/pack) — tránh gõ thẳng URL để xem/sửa đơn của người khác.
  if (role === "KHO_THANH_PHAM" && order.assignedToId !== session?.user?.id) redirect("/orders/pack");

  const canEdit = isKhoThanhPhamRole(role) || isAdminRole(role);
  // QL Kho TP / Admin cấp cao sửa đơn chưa xuất (thêm/bớt mã, số lượng, quy cách) — xem src/lib/order-edit.ts.
  const canEditOrder = canEditOrderItems(role) && (order.status === "HELD" || order.status === "CONFIRMED");
  const plantTypes = canEditOrder
    ? await prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/orders/pack" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-foreground mb-2">
          <ArrowLeft className="w-4 h-4" /> Quay lại danh sách
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-primary-strong" /> Nhặt hàng — {order.code}
          </h1>
          {canEditOrder && <OrderEditDialog orderId={order.id} orderCode={order.code} plantTypes={plantTypes} />}
        </div>
        <p className="text-text-secondary text-sm mt-1">
          {order.customerCode} · {MARKET_LABELS[order.market]} · NV {order.sale.name}
          {order.assignedTo && ` · Giao cho ${order.assignedTo.name} (${order.assignedTo.code})`}
          {order.confirmedAt && ` · Xác nhận lúc ${order.confirmedAt.toLocaleString("vi-VN")}`}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Chi tiết cần nhặt</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderPickTable
            // Đơn bị sửa (thêm/bớt dòng, đổi số lượng) thì dựng lại bảng — state nháp khởi tạo 1 lần từ items.
            key={order.items.map((i) => `${i.id}:${i.quantity}`).join("|")}
            items={order.items.map((item) => ({
              id: item.id,
              plantCode: item.lot.plantType.code,
              plantName: item.lot.plantType.name,
              stageCode: item.lot.stageCode,
              quantity: item.neededQuantity ?? item.quantity,
              pickedQuantity1: item.pickedQuantity1,
              pickedQuantity2: item.pickedQuantity2,
              pickedQuantity3: item.pickedQuantity3,
              pickNotes: item.pickNotes,
            }))}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {!canEdit && (
        <p className="text-xs text-text-muted">Chỉ NV/Quản lý kho thành phẩm được điền số lượng đã nhặt.</p>
      )}
      <div>
        <Link href="/orders/pack">
          <Button size="sm" className="bg-primary hover:bg-primary-hover">
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Quay lại danh sách đơn hàng
          </Button>
        </Link>
      </div>
    </div>
  );
}
