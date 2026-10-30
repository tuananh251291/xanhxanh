import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { rowLabel } from "@/lib/garden-care";
import { reservedByLine } from "@/lib/garden-inventory";
import FinishedCareBoard from "./finished-care-board";

const rowSelect = { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } as const;
const CARE_LOG_TYPES = ["FINISHED_DAMAGE", "TO_LIQUIDATION"];

// Nghiệp vụ 6 — Chăm sóc cây thành phẩm: cây đang chăm sóc ở Kho thành phẩm vườn (mọi size S/M/L trên 1 màn hình),
// QLV ghi nhận cây hỏng / chuyển Kho thanh lý theo từng dòng tồn (mã cây, lô, size, vị trí), xem tổng sau cập nhật
// + lịch sử. Dữ liệu là dòng tồn Nghiệp vụ 5 (GardenStockLine pool FINISHED) — xem /api/garden-finished-care.
export default async function GardenFinishedCarePage({ searchParams }: { searchParams: Promise<{ garden?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || (role !== "NHAN_VIEN_QUAN_LY_VUON" && !isAdminRole(role)) || !(await isPageAllowed(role, "/garden-finished-care"))) {
    redirect("/dashboard");
  }
  const gardens = await getManageableGardens(session.user);
  if (gardens.length === 0) return <p className="text-sm text-text-muted">Bạn chưa được gán quản lý vườn nào — liên hệ Admin cấp cao.</p>;
  const sp = await searchParams;
  const garden = gardens.find((g) => g.id === sp.garden) ?? gardens[0];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [lines, totals, todayTotals, liquidation, logs] = await Promise.all([
    prisma.gardenStockLine.findMany({
      where: { gardenId: garden.id, pool: "FINISHED", quantity: { gt: 0 } },
      select: {
        id: true, stageCode: true, quantity: true,
        lot: { select: { code: true } }, plantType: { select: { code: true, name: true } }, row: { select: rowSelect }, staff: { select: { name: true } },
      },
      orderBy: [{ plantType: { code: "asc" } }, { stageCode: "asc" }],
    }),
    prisma.gardenMovementLog.groupBy({ by: ["type"], where: { gardenId: garden.id, type: { in: CARE_LOG_TYPES } }, _sum: { quantity: true } }),
    prisma.gardenMovementLog.groupBy({ by: ["type"], where: { gardenId: garden.id, type: { in: CARE_LOG_TYPES }, at: { gte: startOfToday } }, _sum: { quantity: true } }),
    prisma.gardenStockLine.aggregate({ where: { gardenId: garden.id, pool: "LIQUIDATION", quantity: { gt: 0 } }, _sum: { quantity: true } }),
    prisma.gardenMovementLog.findMany({
      where: { gardenId: garden.id, type: { in: CARE_LOG_TYPES } },
      orderBy: { at: "desc" },
      take: 100,
      select: {
        id: true, type: true, lotCode: true, quantity: true, fromStage: true, fromRow: true, fromStaff: true, note: true, at: true,
        plantType: { select: { code: true, name: true } }, by: { select: { name: true } },
      },
    }),
  ]);
  const reserved = await reservedByLine(prisma, lines.map((l) => l.id));
  const sumOf = (rows: typeof totals, type: string) => rows.find((r) => r.type === type)?._sum.quantity ?? 0;

  return (
    <FinishedCareBoard
      gardens={gardens}
      gardenId={garden.id}
      lines={lines.map((l) => ({
        id: l.id, stageCode: l.stageCode, quantity: l.quantity, reserved: reserved.get(l.id) ?? 0,
        lotCode: l.lot?.code ?? null, plantCode: l.plantType.code, plantName: l.plantType.name,
        rowLabel: l.row ? rowLabel(l.row) : null, staffName: l.staff?.name ?? null,
      }))}
      summary={{
        damaged: sumOf(totals, "FINISHED_DAMAGE"), liquidated: sumOf(totals, "TO_LIQUIDATION"),
        damagedToday: sumOf(todayTotals, "FINISHED_DAMAGE"), liquidatedToday: sumOf(todayTotals, "TO_LIQUIDATION"),
        liquidationStock: liquidation._sum.quantity ?? 0,
      }}
      logs={logs.map((l) => ({
        id: l.id, type: l.type, lotCode: l.lotCode, quantity: l.quantity, stage: l.fromStage, row: l.fromRow, staff: l.fromStaff, note: l.note,
        at: l.at.toISOString(), plantCode: l.plantType.code, plantName: l.plantType.name, byName: l.by.name,
      }))}
    />
  );
}
