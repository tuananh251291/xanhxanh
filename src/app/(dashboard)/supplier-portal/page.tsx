import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SupplierCheckQuantityForm from "@/components/shared/supplier-check-quantity-form";
import { toVnDateKey } from "@/lib/finished-stock-forecast";
import SupplierNotifications from "./supplier-notifications";
import { ensureSupplierCheckDeadlines } from "@/lib/supplier-check";

const fmtDate = (d: Date) => toVnDateKey(d).split("-").reverse().join("/");
const STATUS: Record<string, { label: string; variant: "in-progress" | "completed" | "overdue" | "info" | "outline" }> = {
  PENDING: { label: "Chờ bạn xác nhận", variant: "in-progress" },
  CONFIRMED: { label: "Có thể đáp ứng — đang giữ hàng", variant: "info" },
  DECLINED: { label: "Không đáp ứng", variant: "outline" },
  EXPIRED: { label: "Quá hạn xác nhận", variant: "overdue" },
  PLACED: { label: "Đã đặt hàng — chờ giao", variant: "completed" },
  DELIVERED: { label: "Đã giao", variant: "completed" },
  CANCELLED: { label: "Đã huỷ — thôi giữ hàng", variant: "outline" },
};

// Cổng nhà cung cấp (role NHA_CUNG_CAP): xác nhận Đơn kiểm tra và nhập phiếu giao — xem src/lib/supplier-check.ts. NCC chỉ
// thấy số lượng, quy cách, ngày giao, không thấy thông tin khách hàng của đơn.
export default async function SupplierPortalPage() {
  const session = await auth();
  if (session?.user?.role !== "NHA_CUNG_CAP") redirect("/dashboard");
  const supplier = await prisma.supplier.findUnique({ where: { userId: session.user.id }, select: { id: true, code: true, name: true } });
  if (!supplier) {
    return <Card><CardContent className="p-6 text-center text-text-secondary">Tài khoản chưa được gắn với nhà cung cấp nào. Vui lòng liên hệ quản lý.</CardContent></Card>;
  }

  await ensureSupplierCheckDeadlines();
  const notifications = await prisma.alert.findMany({
    where: { userId: session.user.id, status: "UNREAD" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, title: true, message: true, createdAt: true },
  });
  const checks = await prisma.supplierCheck.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, code: true, status: true, deliveryDate: true, responseDeadline: true,
      items: { select: { id: true, stageCode: true, requestedQuantity: true, confirmedQuantity: true, deliveredQuantity: true, plantType: { select: { code: true, name: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-secondary-foreground" /> {supplier.name}
        </h1>
        <p className="text-text-secondary text-sm mt-1">Mã nhà cung cấp {supplier.code}. Xác nhận số lượng đáp ứng và nhập phiếu giao hàng tại đây.</p>
      </div>
      <SupplierNotifications notifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))} />
      {checks.length === 0 && <Card><CardContent className="py-12 text-center text-text-muted">Chưa có Đơn kiểm tra nào</CardContent></Card>}
      {checks.map((c) => {
        const status = STATUS[c.status] ?? { label: c.status, variant: "outline" as const };
        const endpoint = `/api/supplier-portal/checks/${c.id}`;
        const label = (i: (typeof c.items)[number]) => `${i.plantType.code} ${i.plantType.name} · ${i.stageCode}`;
        return (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">{c.code} <Badge variant={status.variant}>{status.label}</Badge></CardTitle>
              <p className="text-sm text-text-secondary">
                Ngày giao {fmtDate(c.deliveryDate)}
                {c.status === "PENDING" ? ` · Hạn xác nhận ${c.responseDeadline.toLocaleString("vi-VN")}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              {c.status === "PENDING" ? (
                <SupplierCheckQuantityForm endpoint={endpoint} action="respond" columnLabel="Có thể đáp ứng" submitLabel="Xác nhận có thể đáp ứng" lines={c.items.map((i) => ({ id: i.id, label: label(i), quantity: i.requestedQuantity }))} />
              ) : c.status === "PLACED" ? (
                <SupplierCheckQuantityForm endpoint={endpoint} action="deliver" columnLabel="Thực giao" submitLabel="Gửi phiếu giao" lines={c.items.filter((i) => (i.confirmedQuantity ?? 0) > 0).map((i) => ({ id: i.id, label: label(i), quantity: i.confirmedQuantity ?? 0 }))} />
              ) : (
                <ul className="text-sm text-text-secondary space-y-1">
                  {c.items.map((i) => (
                    <li key={i.id}>
                      {label(i)}: yêu cầu {i.requestedQuantity.toLocaleString("vi-VN")}
                      {i.confirmedQuantity !== null ? `, đáp ứng ${i.confirmedQuantity.toLocaleString("vi-VN")}` : ""}
                      {i.deliveredQuantity !== null ? `, thực giao ${i.deliveredQuantity.toLocaleString("vi-VN")}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
