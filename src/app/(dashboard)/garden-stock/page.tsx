import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { rowLabel } from "@/lib/garden-care";
import { reservedByLine } from "@/lib/garden-inventory";
import { GARDEN_OUTPUT_SPECS } from "@/lib/garden-receipt-constants";
import GardenInventoryBoard from "./garden-inventory-board";

const rowSelect = { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } as const;

// Nghiệp vụ 5 — QLV điều phối cây: tồn chi tiết 4 kho (Kho nhiễm / Kho cây trồng / Kho thành phẩm / Kho thanh lý)
// theo lô, size, vị trí, NV phụ trách — tồn vật lý / giữ chỗ / khả dụng; Hướng A điều phối (chuyển kho, đổi
// size/vị trí/NV), Hướng B phân bổ cho đơn hàng Sale (Chờ đóng gói → xuất kho / huỷ); lịch sử thao tác. Quản lý
// vườn thao tác vườn mình quản lý, Admin xem/thao tác mọi vườn. Xem src/lib/garden-inventory.ts.
export default async function GardenStockPage({ searchParams }: { searchParams: Promise<{ garden?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isAdminRole(role)) || !(await isPageAllowed(role, "/garden-stock"))) {
    redirect("/dashboard");
  }
  const gardens = await getManageableGardens(session.user);
  if (gardens.length === 0) return <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>;
  const sp = await searchParams;
  const garden = gardens.find((g) => g.id === sp.garden) ?? gardens[0];

  const [lines, pending, allocations, logs, rows, staff, orders] = await Promise.all([
    prisma.gardenStockLine.findMany({
      where: { gardenId: garden.id, quantity: { gt: 0 } },
      select: {
        id: true, pool: true, stageCode: true, quantity: true, rowId: true, staffId: true,
        lot: { select: { code: true } }, plantType: { select: { code: true, name: true } }, row: { select: rowSelect }, staff: { select: { name: true } },
      },
      orderBy: [{ plantType: { code: "asc" } }, { stageCode: "asc" }],
    }),
    // Đã nhận nhưng chưa qua phân loại NV3 (chưa có lô).
    prisma.gardenStock.findMany({
      where: { gardenId: garden.id, quantity: { gt: 0 } },
      select: { pool: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
    }),
    prisma.gardenAllocation.findMany({
      where: { gardenId: garden.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true, status: true, pool: true, stageCode: true, quantity: true, shippedQuantity: true, cancelledQuantity: true, createdAt: true,
        order: { select: { code: true, customerCode: true, status: true, sale: { select: { name: true } } } },
        plantType: { select: { code: true, name: true } }, lot: { select: { code: true } },
        line: { select: { row: { select: rowSelect } } }, createdBy: { select: { name: true } },
        packedQuantity: true, packItem: { select: { request: { select: { code: true } } } },
      },
    }),
    prisma.gardenMovementLog.findMany({
      where: { gardenId: garden.id },
      orderBy: { at: "desc" },
      take: 60,
      select: {
        id: true, type: true, lotCode: true, quantity: true, fromPool: true, toPool: true, fromStage: true, toStage: true,
        fromRow: true, toRow: true, fromStaff: true, toStaff: true, orderCode: true, note: true, at: true,
        plantType: { select: { code: true, name: true } }, by: { select: { name: true } },
      },
    }),
    prisma.gardenRow.findMany({
      where: { rack: { house: { gardenId: garden.id } } },
      select: { id: true, ...rowSelect },
      orderBy: [{ rack: { house: { number: "asc" } } }, { rack: { letter: "asc" } }, { number: "asc" }],
    }),
    prisma.gardenStaff.findMany({ where: { gardenId: garden.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Đơn hàng Sale đang giữ/đã xác nhận — chọn khi phân bổ.
    prisma.order.findMany({
      where: { status: { in: ["HELD", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, code: true, customerCode: true, status: true, sale: { select: { name: true } } },
    }),
  ]);
  const reserved = await reservedByLine(prisma, lines.map((l) => l.id));
  const stageOptions = [...new Set([...GARDEN_OUTPUT_SPECS, ...lines.map((l) => l.stageCode)])];

  return (
    <GardenInventoryBoard
      gardens={gardens}
      gardenId={garden.id}
      lines={lines.map((l) => ({
        id: l.id, pool: l.pool, stageCode: l.stageCode, quantity: l.quantity, reserved: reserved.get(l.id) ?? 0,
        lotCode: l.lot?.code ?? null, plantCode: l.plantType.code, plantName: l.plantType.name,
        rowId: l.rowId, rowLabel: l.row ? rowLabel(l.row) : null, staffId: l.staffId, staffName: l.staff?.name ?? null,
      }))}
      pending={pending.map((p) => ({ pool: p.pool, stageCode: p.stageCode, quantity: p.quantity, plantCode: p.plantType.code, plantName: p.plantType.name }))}
      allocations={allocations.map((a) => ({
        id: a.id, status: a.status, pool: a.pool, stageCode: a.stageCode, quantity: a.quantity, shipped: a.shippedQuantity, cancelled: a.cancelledQuantity,
        createdAt: a.createdAt.toISOString(), orderCode: a.order.code, customerCode: a.order.customerCode, orderStatus: a.order.status, saleName: a.order.sale.name,
        plantCode: a.plantType.code, plantName: a.plantType.name, lotCode: a.lot?.code ?? null, rowLabel: a.line.row ? rowLabel(a.line.row) : null, createdBy: a.createdBy.name,
        packCode: a.packItem?.request.code ?? null, packed: a.packedQuantity,
      }))}
      logs={logs.map((l) => ({ ...l, at: l.at.toISOString(), plantCode: l.plantType.code, plantName: l.plantType.name, byName: l.by.name }))}
      rows={rows.map((r) => ({ id: r.id, label: rowLabel(r) }))}
      staff={staff}
      orders={orders.map((o) => ({ id: o.id, label: `${o.code} · KH ${o.customerCode} · ${o.sale.name}${o.status === "HELD" ? " · đang giữ" : ""}` }))}
      stageOptions={stageOptions}
    />
  );
}
