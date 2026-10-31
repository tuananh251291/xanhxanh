import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { rowLabel } from "@/lib/garden-care";
import { ALLOCATABLE_POOLS, reservedByLine } from "@/lib/garden-inventory";
import GardenPackingBoard from "./garden-packing-board";

const rowSelect = { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } as const;

// Nghiệp vụ 7 — Đóng gói đơn hàng (QLV): phiếu giao vườn NV Điều phối gửi → phân bổ từng dòng từ Kho thành phẩm/Kho
// thanh lý đúng mã cây + size, giao NV đóng gói (Nhân sự vườn loại Đóng hàng), ghi nhận số đã đóng gói, xác nhận xuất
// kho (trừ tồn vật lý đúng nguồn, không vượt số đã đóng gói). Xem src/lib/garden-packing.ts.
export default async function GardenPackingPage({ searchParams }: { searchParams: Promise<{ garden?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isAdminRole(role)) || !(await isPageAllowed(role, "/garden-packing"))) redirect("/dashboard");
  const gardens = await getManageableGardens(session.user);
  if (gardens.length === 0) return <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>;
  const sp = await searchParams;
  const garden = gardens.find((g) => g.id === sp.garden) ?? gardens[0];

  const requestSelect = {
    id: true, code: true, status: true, notes: true, createdAt: true, doneAt: true, cancelledAt: true, cancelReason: true, packerId: true,
    order: { select: { code: true, customerCode: true, expectedShipAt: true, notes: true, sale: { select: { name: true } }, marketWarehouse: { select: { name: true } } } },
    createdBy: { select: { name: true } }, packer: { select: { name: true } },
    items: {
      select: {
        id: true, plantTypeId: true, stageCode: true, quantity: true, notes: true, plantType: { select: { code: true, name: true } },
        allocations: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true, status: true, pool: true, quantity: true, cancelledQuantity: true, packedQuantity: true, shippedQuantity: true,
            lot: { select: { code: true } }, line: { select: { quantity: true, row: { select: rowSelect } } },
          },
        },
      },
    },
  } as const;

  const [active, recent, lines, packers] = await Promise.all([
    prisma.gardenPackRequest.findMany({ where: { gardenId: garden.id, status: "SENT" }, orderBy: { createdAt: "asc" }, select: requestSelect }),
    prisma.gardenPackRequest.findMany({ where: { gardenId: garden.id, status: { in: ["DONE", "CANCELLED"] } }, orderBy: { updatedAt: "desc" }, take: 30, select: requestSelect }),
    prisma.gardenStockLine.findMany({
      where: { gardenId: garden.id, pool: { in: ALLOCATABLE_POOLS }, quantity: { gt: 0 } },
      select: { id: true, pool: true, plantTypeId: true, stageCode: true, quantity: true, lot: { select: { code: true } }, row: { select: rowSelect }, staff: { select: { name: true } } },
    }),
    prisma.gardenStaff.findMany({ where: { gardenId: garden.id, isActive: true, types: { has: "DONG_HANG" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const reserved = await reservedByLine(prisma, lines.map((l) => l.id));

  const mapRequest = (r: (typeof active)[number]) => ({
    id: r.id, code: r.code, status: r.status, notes: r.notes, createdAt: r.createdAt.toISOString(),
    doneAt: r.doneAt?.toISOString() ?? null, cancelledAt: r.cancelledAt?.toISOString() ?? null, cancelReason: r.cancelReason,
    orderCode: r.order.code, customer: r.order.marketWarehouse?.name ?? r.order.customerCode, saleName: r.order.sale.name,
    orderNotes: r.order.notes, expectedShipAt: r.order.expectedShipAt?.toISOString() ?? null,
    createdByName: r.createdBy.name, packerId: r.packerId, packerName: r.packer?.name ?? null,
    items: r.items.map((it) => ({
      id: it.id, plantTypeId: it.plantTypeId, plantCode: it.plantType.code, plantName: it.plantType.name, stageCode: it.stageCode, quantity: it.quantity, notes: it.notes,
      allocations: it.allocations.map((a) => ({
        id: a.id, status: a.status, pool: a.pool, quantity: a.quantity, cancelled: a.cancelledQuantity, packed: a.packedQuantity, shipped: a.shippedQuantity,
        lotCode: a.lot?.code ?? null, rowLabel: a.line.row ? rowLabel(a.line.row) : null, lineQuantity: a.line.quantity,
      })),
    })),
  });

  return (
    <GardenPackingBoard
      gardens={gardens}
      gardenId={garden.id}
      active={active.map(mapRequest)}
      recent={recent.map(mapRequest)}
      lines={lines.map((l) => ({
        id: l.id, pool: l.pool, plantTypeId: l.plantTypeId, stageCode: l.stageCode, quantity: l.quantity, available: l.quantity - (reserved.get(l.id) ?? 0),
        lotCode: l.lot?.code ?? null, rowLabel: l.row ? rowLabel(l.row) : null, staffName: l.staff?.name ?? null,
      }))}
      packers={packers}
    />
  );
}
