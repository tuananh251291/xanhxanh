import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { canDispatchPack } from "@/lib/garden-packing";
import { GARDEN_OUTPUT_SPECS } from "@/lib/garden-receipt-constants";
import PackRequestsBoard from "./pack-requests-board";

// Nghiệp vụ 7 — NV Điều phối: nhận đơn hàng Sale, xác nhận số lượng giao cho từng Vườn sản xuất đóng gói (phiếu giao
// vườn DGV-), gửi QLV; theo dõi tiến độ phân bổ / đóng gói / xuất kho của từng phiếu; huỷ phiếu khi cần.
export default async function GardenPackRequestsPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !canDispatchPack(role) || !(await isPageAllowed(role, "/garden-pack-requests"))) redirect("/dashboard");

  const [orders, gardens, plantTypes, requests] = await Promise.all([
    prisma.order.findMany({
      where: { status: { in: ["HELD", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true, code: true, customerCode: true, status: true, notes: true, expectedShipAt: true,
        sale: { select: { name: true } }, marketWarehouse: { select: { name: true } },
        items: { select: { quantity: true, lot: { select: { stageCode: true, plantType: { select: { code: true } } } } } },
      },
    }),
    prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, manager: { select: { name: true } } }, orderBy: { code: "asc" } }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.gardenPackRequest.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true, code: true, status: true, notes: true, createdAt: true, doneAt: true, cancelledAt: true, cancelReason: true,
        order: { select: { code: true, customerCode: true, sale: { select: { name: true } } } },
        garden: { select: { name: true } }, packer: { select: { name: true } }, createdBy: { select: { name: true } },
        items: {
          select: {
            id: true, stageCode: true, quantity: true, notes: true, plantType: { select: { code: true, name: true } },
            allocations: { select: { quantity: true, cancelledQuantity: true, packedQuantity: true, shippedQuantity: true } },
          },
        },
      },
    }),
  ]);

  return (
    <PackRequestsBoard
      orders={orders.map((o) => ({
        id: o.id, code: o.code, status: o.status, customer: o.marketWarehouse?.name ?? o.customerCode, saleName: o.sale.name, notes: o.notes,
        expectedShipAt: o.expectedShipAt?.toISOString() ?? null,
        items: o.items.map((i) => `${i.lot.plantType.code} ${i.lot.stageCode} × ${i.quantity.toLocaleString("vi-VN")}`),
      }))}
      gardens={gardens.map((g) => ({ id: g.id, label: `${g.name} (${g.code})${g.manager ? ` · QLV ${g.manager.name}` : " · chưa có QLV"}` }))}
      plantTypes={plantTypes}
      sizes={GARDEN_OUTPUT_SPECS}
      requests={requests.map((r) => ({
        id: r.id, code: r.code, status: r.status, notes: r.notes, createdAt: r.createdAt.toISOString(), doneAt: r.doneAt?.toISOString() ?? null,
        cancelledAt: r.cancelledAt?.toISOString() ?? null, cancelReason: r.cancelReason,
        orderCode: r.order.code, customer: r.order.customerCode, saleName: r.order.sale.name, gardenName: r.garden.name,
        packerName: r.packer?.name ?? null, createdByName: r.createdBy.name,
        items: r.items.map((it) => ({
          id: it.id, plantCode: it.plantType.code, plantName: it.plantType.name, stageCode: it.stageCode, quantity: it.quantity, notes: it.notes,
          allocated: it.allocations.reduce((s, a) => s + a.quantity - a.cancelledQuantity, 0),
          packed: it.allocations.reduce((s, a) => s + Math.max(a.shippedQuantity, Math.min(a.packedQuantity, a.quantity - a.cancelledQuantity)), 0),
          shipped: it.allocations.reduce((s, a) => s + a.shippedQuantity, 0),
        })),
      }))}
    />
  );
}
