import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { getShipCutoffKey, toVnDateKey } from "@/lib/finished-stock-forecast";
import { orderItemSpec, ORDER_ITEM_SPEC_FIELDS } from "@/lib/order-item-spec";
import { canManageSupplierChecks, ensureSupplierCheckDeadlines } from "@/lib/supplier-check";
import SupplierCheckBoard, { type BoardOrder } from "./supplier-check-board";

// "Kiểm tra NCC" — QL Kho TP xử lý phần thiếu của đơn hàng, xem src/lib/supplier-check.ts.
export default async function SupplierChecksPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!canManageSupplierChecks(role)) redirect("/dashboard");
  if (!(await isPageAllowed(role, "/supplier-checks"))) redirect("/dashboard");
  await ensureSupplierCheckDeadlines();

  const [orders, suppliers] = await Promise.all([
    prisma.order.findMany({
      where: {
        // QL chỉ xử lý đơn của NV bán hàng thuộc kho mình; Admin cấp cao xem hết.
        ...(role === "QUAN_LY_KHO_THANH_PHAM" ? { sale: { OR: [{ workplaceWarehouseId: session?.user?.workplaceWarehouseId ?? "" }, { workplaceWarehouseId: null }] } } : {}),
        OR: [
          // Sale đã báo khách xác nhận: chờ QL phản hồi; đã phản hồi thì đơn thiếu vẫn hiện để theo dõi NCC, đơn đủ thôi hiện.
          { status: "HELD", customerConfirmedAt: { not: null }, OR: [{ supplyResultSentAt: null }, { shortages: { some: {} } }] },
          // Đơn đã cọc mà không còn gì để đặt hàng/nhập giao thì thôi hiện.
          { status: "CONFIRMED", shortages: { some: {} }, supplierChecks: { some: { status: { in: ["CONFIRMED", "PLACED"] } } } },
        ],
      },
      orderBy: { expectedShipAt: "asc" },
      select: {
        id: true, code: true, status: true, customerCode: true, expectedShipAt: true, holdUntil: true, supplyResultSentAt: true,
        sale: { select: { name: true } },
        items: { select: { quantity: true, ...ORDER_ITEM_SPEC_FIELDS, lot: { select: { plantTypeId: true, stageCode: true, plantType: { select: { code: true, name: true } } } } } },
        shortages: { select: { plantTypeId: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } } },
        supplierChecks: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, code: true, status: true, deliveryDate: true, responseDeadline: true,
            supplier: { select: { name: true, userId: true } },
            items: { select: { id: true, plantTypeId: true, stageCode: true, requestedQuantity: true, confirmedQuantity: true, deliveredQuantity: true, plantType: { select: { code: true } } } },
          },
        },
      },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, userId: true }, orderBy: { name: "asc" } }),
  ]);

  const boardOrders: BoardOrder[] = await Promise.all(orders.map(async (o) => {
    // Mọi mã + quy cách của đơn (cả dòng đủ hàng), không chỉ dòng thiếu — QL kiểm tra đáp ứng cả đơn.
    const specs = new Map(o.shortages.map((s) => [`${s.plantTypeId}:${s.stageCode}`, { plantTypeId: s.plantTypeId, stageCode: s.stageCode, quantity: s.quantity, plantType: s.plantType }]));
    for (const item of o.items) {
      const spec = orderItemSpec(item);
      const key = `${spec.plantTypeId}:${spec.stageCode}`;
      if (!specs.has(key)) specs.set(key, { plantTypeId: spec.plantTypeId, stageCode: spec.stageCode, quantity: 0, plantType: spec.plantType });
    }
    const lines = [...specs.values()].map((s) => {
      const same = (i: { plantTypeId: string; stageCode: string }) => i.plantTypeId === s.plantTypeId && i.stageCode === s.stageCode;
      const held = o.items.filter((i) => same(orderItemSpec(i))).reduce((sum, i) => sum + i.quantity, 0);
      const checkLines = o.supplierChecks.flatMap((c) => c.items.filter(same).map((i) => ({ status: c.status, requested: i.requestedQuantity, confirmed: i.confirmedQuantity ?? 0 })));
      const pending = checkLines.filter((l) => l.status === "PENDING").reduce((sum, l) => sum + l.requested, 0);
      const confirmed = checkLines.filter((l) => ["CONFIRMED", "PLACED", "DELIVERED"].includes(l.status)).reduce((sum, l) => sum + l.confirmed, 0);
      return {
        plantTypeId: s.plantTypeId, stageCode: s.stageCode, code: s.plantType.code, name: s.plantType.name,
        // Sau khi đặt hàng, phần NCC đã nằm trong dòng đơn — không cộng lần nữa vào số đáp ứng từ kho.
        fromStock: held - checkLines.filter((l) => l.status === "PLACED" || l.status === "DELIVERED").reduce((sum, l) => sum + l.confirmed, 0),
        shortage: s.quantity, pending, confirmed, left: Math.max(0, s.quantity - pending - confirmed),
      };
    });
    return {
      id: o.id, code: o.code, status: o.status, customerCode: o.customerCode, saleName: o.sale.name,
      shipKey: o.expectedShipAt ? toVnDateKey(o.expectedShipAt) : null,
      latestDeliveryKey: o.expectedShipAt ? await getShipCutoffKey(o.expectedShipAt) : null,
      holdUntil: o.holdUntil?.toISOString() ?? null,
      resultSent: !!o.supplyResultSentAt,
      lines,
      checks: o.supplierChecks.map((c) => ({
        id: c.id, code: c.code, status: c.status, supplierName: c.supplier.name, hasAccount: !!c.supplier.userId,
        deliveryKey: toVnDateKey(c.deliveryDate), responseDeadline: c.responseDeadline.toISOString(),
        items: c.items.map((i) => ({ id: i.id, label: `${i.plantType.code} ${i.stageCode}`, requested: i.requestedQuantity, confirmed: i.confirmedQuantity, delivered: i.deliveredQuantity })),
      })),
    };
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary-strong" /> Kiểm tra NCC
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Đơn khách đã xác nhận: kiểm tra đáp ứng, phần thiếu gửi NCC kiểm tra, gửi kết quả cho NV bán hàng, đặt hàng khi khách đã cọc.
        </p>
      </div>
      <SupplierCheckBoard orders={boardOrders} suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.name} (${s.code})${s.userId ? "" : " · chưa có tài khoản"}` }))} />
    </div>
  );
}
