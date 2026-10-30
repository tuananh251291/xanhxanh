import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPageAllowed } from "@/lib/permissions";
import { getManageableGardens } from "@/lib/garden-staff";
import { careLotScope, getCareStaffProfile, rowLabel, CARE_POOLS } from "@/lib/garden-care";
import { GARDEN_CARE_TICKET_LABELS, GARDEN_DAMAGE_STATUS_LABELS, GARDEN_STOCK_POOL_LABELS } from "@/lib/garden-receipt-constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sprout } from "lucide-react";
import { format } from "date-fns";
import CareLotActions, { type GardenPlaceOptions } from "./care-lot-actions";

type Pool = keyof typeof GARDEN_STOCK_POOL_LABELS;
type Status = keyof typeof GARDEN_DAMAGE_STATUS_LABELS;
const STATUS_BADGE: Record<Status, "info" | "in-progress" | "overdue" | "completed"> = {
  DRAFT: "info", SUBMITTED: "in-progress", RETURNED: "overdue", CONFIRMED: "completed",
};

// Nghiệp vụ 4 — Chăm sóc cây mô: lô chăm sóc (tự tạo khi QLV xác nhận phiếu cây hỏng NV3) theo dãy/NV phụ trách,
// phiếu sắp xếp vị trí (QLV), phiếu cây hỏng khi chăm sóc + phiếu cây đạt size S (NV gửi, QLV duyệt).
export default async function GardenCarePage({ searchParams }: { searchParams: Promise<{ pool?: string }> }) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!session?.user || !(await isPageAllowed(role, "/garden-care"))) redirect("/dashboard");
  const scope = await careLotScope(session.user);
  if (!scope) redirect("/dashboard");

  const sp = await searchParams;
  const pool = sp.pool === "CONTAMINATED" || sp.pool === "PLANNED" ? (sp.pool as Pool) : null;
  const managedGardens = role === "NV_CHAM_SOC_CAY_MO" ? [] : await getManageableGardens(session.user);
  const managedIds = new Set(managedGardens.map((g) => g.id));
  const profile = role === "NV_CHAM_SOC_CAY_MO" ? await getCareStaffProfile(session.user.id) : null;

  const ticketScope: Prisma.GardenCareTicketWhereInput = role === "NV_CHAM_SOC_CAY_MO"
    ? { OR: [{ createdById: session.user.id }, { lot: scope }] }
    : { lot: scope };

  const [lots, tickets, rows, staff] = await Promise.all([
    // Lô còn cây ở kho đang chăm sóc (Kho nhiễm/Kho cây trồng) — lọc luồng theo kho của dòng tồn.
    prisma.gardenCareLot.findMany({
      where: { ...scope, stockLines: { some: { pool: pool ? pool : { in: [...CARE_POOLS] }, quantity: { gt: 0 } } } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, gardenId: true, stageCode: true, initialQuantity: true, staffId: true, createdAt: true,
        garden: { select: { name: true } }, plantType: { select: { code: true, name: true } }, staff: { select: { name: true } },
        receiptItem: { select: { receipt: { select: { id: true, code: true } } } },
        stockLines: {
          where: { pool: pool ? pool : { in: [...CARE_POOLS] }, quantity: { gt: 0 } },
          select: { id: true, pool: true, rowId: true, quantity: true, row: { select: { number: true, rack: { select: { letter: true, house: { select: { number: true } } } } } } },
        },
        tickets: { where: { status: { not: "CONFIRMED" }, type: { in: ["DAMAGE", "SIZE_S"] } }, select: { id: true, code: true, type: true } },
      },
    }),
    prisma.gardenCareTicket.findMany({
      where: ticketScope,
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true, code: true, type: true, status: true, createdAt: true,
        lot: { select: { code: true, pool: true, plantType: { select: { code: true } } } },
        createdBy: { select: { name: true } }, staff: { select: { name: true } },
        items: { select: { reportedQuantity: true, confirmedQuantity: true } },
      },
    }),
    // Dãy + NV chăm sóc cây mô của các vườn QLV quản lý — cho hộp thoại sắp xếp vị trí.
    managedGardens.length
      ? prisma.gardenRow.findMany({
          where: { rack: { house: { gardenId: { in: [...managedIds] } } } },
          select: { id: true, number: true, rack: { select: { letter: true, house: { select: { number: true, gardenId: true } } } } },
          orderBy: [{ rack: { house: { number: "asc" } } }, { rack: { letter: "asc" } }, { number: "asc" }],
        })
      : Promise.resolve([]),
    managedGardens.length
      ? prisma.gardenStaff.findMany({ where: { gardenId: { in: [...managedIds] }, isActive: true, types: { has: "CHAM_SOC_CAY_MO" } }, select: { id: true, name: true, gardenId: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const placeOptions: Record<string, GardenPlaceOptions> = {};
  for (const g of managedGardens) {
    placeOptions[g.id] = {
      rows: rows.filter((r) => r.rack.house.gardenId === g.id).map((r) => ({ id: r.id, label: rowLabel(r) })),
      staff: staff.filter((s) => s.gardenId === g.id).map((s) => ({ id: s.id, name: s.name })),
    };
  }
  const fmt = (n: number) => n.toLocaleString("vi-VN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Sprout className="w-6 h-6 text-primary-strong" /> Chăm sóc cây mô</h1>
        <p className="text-text-secondary text-sm mt-1">
          Cây còn lại sau phiếu ghi nhận cây hỏng (NV3) tự chuyển thành lô chăm sóc. QLV sắp xếp lô vào giàn/kệ và giao NV phụ trách; NV báo cây hỏng hoặc cây đạt size S (1.7 inch) theo từng dãy, QLV duyệt mới cập nhật tồn — cây đạt S chuyển sang Kho thành phẩm vườn.
        </p>
      </div>
      {role === "NV_CHAM_SOC_CAY_MO" && !profile && (
        <p className="text-sm text-warning-foreground bg-warning-light rounded-lg p-3">Tài khoản chưa được gắn vào vườn sản xuất nào — liên hệ Admin/Quản lý vườn.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/garden-care"><Button size="sm" variant={pool ? "outline" : "default"}>Cả 2 luồng</Button></Link>
        <Link href="/garden-care?pool=CONTAMINATED"><Button size="sm" variant={pool === "CONTAMINATED" ? "default" : "outline"}>Luồng A — Cây nhiễm</Button></Link>
        <Link href="/garden-care?pool=PLANNED"><Button size="sm" variant={pool === "PLANNED" ? "default" : "outline"}>Luồng B — Cây trồng theo kế hoạch</Button></Link>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Lô đang chăm sóc ({lots.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {lots.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-10">Chưa có lô nào — lô tự tạo khi QLV xác nhận phiếu ghi nhận cây hỏng (NV3).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã lô</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã cây / Tên cây</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Kho</th>
                    <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Số cây</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Giàn/kệ</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">NV phụ trách</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => {
                    const careQty = l.stockLines.reduce((s, x) => s + x.quantity, 0);
                    const unplaced = l.stockLines.filter((x) => !x.rowId).reduce((s, x) => s + x.quantity, 0);
                    const linePools = [...new Set(l.stockLines.map((x) => x.pool))];
                    const canPlace = managedIds.has(l.gardenId);
                    const canReport = canPlace || (!!profile && profile.id === l.staffId);
                    return (
                      <tr key={l.id} className="border-b border-divider last:border-0 even:bg-primary-light/30 align-top">
                        <td className="px-4 py-2">
                          <p className="font-mono">{l.code}</p>
                          <Link href={`/garden-receipts/${l.receiptItem.receipt.id}`} className="text-xs text-text-secondary underline underline-offset-2">{l.receiptItem.receipt.code}</Link>
                        </td>
                        <td className="px-4 py-2"><span className="font-mono text-text-secondary mr-1.5">{l.plantType.code}</span>{l.plantType.name} ({l.stageCode})</td>
                        <td className="px-4 py-2">
                          {linePools.map((p) => <Badge key={p} variant={p === "CONTAMINATED" ? "in-progress" : "info"} className="mr-1">{GARDEN_STOCK_POOL_LABELS[p as Pool]}</Badge>)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {fmt(careQty)}
                          {careQty !== l.initialQuantity && <span className="block text-xs text-text-muted">ban đầu {fmt(l.initialQuantity)}</span>}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {l.stockLines.filter((x) => x.row).map((x) => (
                              <span key={x.id} className="rounded-md bg-primary-light text-primary-strong font-mono text-xs px-2 py-0.5">{rowLabel(x.row!)}: {fmt(x.quantity)}</span>
                            ))}
                            {unplaced > 0 && <span className="rounded-md bg-warning-light text-warning-foreground text-xs px-2 py-0.5">Chưa xếp: {fmt(unplaced)}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-foreground">{l.staff?.name ?? <span className="text-text-muted">Chưa giao</span>}</td>
                        <td className="px-4 py-2">
                          <CareLotActions
                            lot={{
                              id: l.id, code: l.code, staffId: l.staffId,
                              lines: l.stockLines.map((x) => ({ id: x.id, rowId: x.rowId, label: x.row ? rowLabel(x.row) : "Chưa xếp", quantity: x.quantity })),
                              openTickets: l.tickets,
                            }}
                            placeOptions={canPlace ? placeOptions[l.gardenId] : null}
                            canReport={canReport}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Phiếu chăm sóc gần đây</CardTitle></CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">Chưa có phiếu nào</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-light">
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Mã phiếu</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Loại phiếu</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Lô</th>
                    <th className="text-right px-4 py-2 text-base text-primary-strong font-bold">Số lượng</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Người lập</th>
                    <th className="text-left px-4 py-2 text-base text-primary-strong font-bold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => {
                    const qty = t.items.reduce((s, i) => s + (t.status === "CONFIRMED" ? i.confirmedQuantity ?? 0 : i.reportedQuantity), 0);
                    return (
                      <tr key={t.id} className="border-b border-divider last:border-0 even:bg-primary-light/30">
                        <td className="px-4 py-2"><Link href={`/garden-care/tickets/${t.id}`} className="font-mono text-primary-strong underline underline-offset-2">{t.code}</Link></td>
                        <td className="px-4 py-2">{GARDEN_CARE_TICKET_LABELS[t.type]}</td>
                        <td className="px-4 py-2"><span className="font-mono">{t.lot.code}</span> · {t.lot.plantType.code} · {GARDEN_STOCK_POOL_LABELS[t.lot.pool]}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmt(qty)}</td>
                        <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{t.createdBy.name} · {format(t.createdAt, "dd/MM HH:mm")}</td>
                        <td className="px-4 py-2"><Badge variant={STATUS_BADGE[t.status]}>{t.type === "PLACE" ? "Đã duyệt" : GARDEN_DAMAGE_STATUS_LABELS[t.status]}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
