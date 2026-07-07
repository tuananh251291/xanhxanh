import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { vi } from "date-fns/locale";
import { STAGE_LABELS, motherClusterUnits } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import CollapsibleRoom from "./collapsible-room";
import SummaryByType from "./summary-by-type";

function expiryClass(expectedMoveAt: Date | null): string {
  if (!expectedMoveAt) return "text-text-muted";
  const daysLeft = differenceInCalendarDays(expectedMoveAt, new Date());
  if (daysLeft < 0) return "text-destructive font-semibold";
  if (daysLeft <= 3) return "text-warning-foreground font-semibold";
  return "text-text-muted";
}

export default async function KhoSangPage() {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/kho-sang"))) redirect("/dashboard");

  // Nhân viên kỹ thuật chỉ xem được số liệu Phòng mẫu mẹ, không xem được toàn bộ Kho sáng
  // (ẩn Phòng ra rễ — thuộc phạm vi theo dõi của KHO_MO).
  const onlyMotherRoom = role === "KY_THUAT";
  // NV kho mô/cấy mô chỉ làm việc với đúng 1 kho sản xuất (nếu đã được Admin gán) — NV kỹ thuật không
  // bị giới hạn, làm việc được ở mọi kho.
  const workplaceWarehouseId = role !== "KY_THUAT" ? session?.user?.workplaceWarehouseId : null;

  const rooms = await prisma.room.findMany({
    where: {
      type: onlyMotherRoom ? "PHONG_MAU_ME" : { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] },
      isActive: true,
      ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
    },
    include: {
      warehouse: { select: { name: true } },
      shelves: {
        where: { isActive: true },
        include: {
          plantType: { select: { name: true } },
          assignedStaff: { select: { name: true } },
          lots: {
            where: { status: "ACTIVE" },
            include: { plantType: { select: { code: true, name: true } } },
            orderBy: { enteredAt: "asc" },
          },
        },
        orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
      },
    },
    orderBy: [{ warehouse: { name: "asc" } }],
  });

  const totalLots = rooms.flatMap((r) => r.shelves.flatMap((s) => s.lots));
  const totalMother = totalLots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
  const totalFinished = totalLots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sun className="w-6 h-6 text-warning-foreground" /> {onlyMotherRoom ? "Phòng mẫu mẹ" : "Phòng sáng"}
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {onlyMotherRoom
            ? `Tổng: ${totalLots.length} lô · Mẫu mẹ: ${totalMother.toLocaleString("vi-VN")}`
            : `Tổng: ${totalLots.length} lô · Mẫu mẹ: ${totalMother.toLocaleString("vi-VN")} · Thành phẩm: ${totalFinished.toLocaleString("vi-VN")}`}
        </p>
      </div>

      {/* Summary by plant type */}
      <SummaryByType entries={(() => {
        const byType: Record<string, { name: string; mother: number; finished: number }> = {};
        for (const lot of totalLots) {
          const key = lot.plantTypeId;
          if (!byType[key]) byType[key] = { name: `${lot.plantType.name} (${lot.plantType.code})`, mother: 0, finished: 0 };
          if (lot.stage === "MAU_ME") byType[key].mother += lot.quantity;
          else byType[key].finished += lot.quantity;
        }
        return Object.values(byType);
      })()} />

      {/* Per phòng sáng and shelf */}
      {rooms.map((room) => (
        <CollapsibleRoom key={room.id} title={`${room.warehouse.name} — ${room.name}`}>
          {room.shelves.length === 0 ? (
            <p className="text-sm text-text-muted pl-2">Chưa có kệ</p>
          ) : room.type === "PHONG_MAU_ME" ? (
            (() => {
              const renderRow = (shelf: (typeof room.shelves)[number]) => {
                const bagsByCode = shelf.lots.reduce<Record<string, number>>((acc, l) => {
                  acc[l.stageCode] = (acc[l.stageCode] ?? 0) + l.quantity;
                  return acc;
                }, {});
                return (
                  <tr key={shelf.id} className="border-b last:border-0 even:bg-primary-light hover:bg-primary-light/60">
                    <td className="px-3 py-2 text-sm font-bold text-foreground whitespace-nowrap">{shelf.code}</td>
                    <td className="px-3 py-2 text-sm text-text-secondary whitespace-nowrap">{shelf.name}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{shelf.plantType?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{shelf.assignedStaff?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{(bagsByCode["M03"] ?? 0).toLocaleString("vi-VN")}</td>
                    <td className="px-3 py-2 text-xs text-text-secondary whitespace-nowrap">{(bagsByCode["M05"] ?? 0).toLocaleString("vi-VN")}</td>
                  </tr>
                );
              };
              const renderTable = (rows: typeof room.shelves) => (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-primary-light">
                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Mã kệ</th>
                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên kệ</th>
                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Tên cây chi tiết</th>
                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">Nhân viên phụ trách</th>
                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">M03</th>
                        <th className="text-left px-3 py-2 text-sm text-primary-strong font-bold">M05</th>
                      </tr>
                    </thead>
                    <tbody>{rows.map(renderRow)}</tbody>
                  </table>
                </div>
              );
              const assignedShelves = room.shelves.filter((s) => s.assignedStaff);
              const unassignedShelves = room.shelves.filter((s) => !s.assignedStaff);
              return (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2">
                      Kho mẫu mẹ đã chia <span className="font-normal text-text-muted">({assignedShelves.length} kệ)</span>
                    </p>
                    {assignedShelves.length === 0 ? (
                      <p className="text-xs text-text-muted pl-1">Chưa có kệ nào được gán nhân viên</p>
                    ) : renderTable(assignedShelves)}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text-secondary mb-2">
                      Kho mẫu mẹ chung <span className="font-normal text-text-muted">({unassignedShelves.length} kệ)</span>
                    </p>
                    {unassignedShelves.length === 0 ? (
                      <p className="text-xs text-text-muted pl-1">Không còn kệ nào chưa gán nhân viên</p>
                    ) : renderTable(unassignedShelves)}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {room.shelves.map((shelf) => {
                const shelfMother = shelf.lots.filter((l) => l.stage === "MAU_ME").reduce((s, l) => s + l.quantity, 0);
                const shelfFinished = shelf.lots.filter((l) => l.stage === "THANH_PHAM").reduce((s, l) => s + l.quantity, 0);
                // Sức chứa kệ Phòng mẫu mẹ tính theo cụm (túi M03 × 3, túi M05 × 5) — xem motherClusterUnits.
                const shelfClusters = shelf.lots
                  .filter((l) => l.stage === "MAU_ME")
                  .reduce((s, l) => s + motherClusterUnits(l.stageCode, l.quantity), 0) + shelfFinished;
                return (
                  <Card key={shelf.id} className={shelf.lots.length === 0 ? "opacity-50" : ""}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-mono">{shelf.code}</CardTitle>
                        <span className="text-xs text-text-secondary">{shelf.name}</span>
                      </div>
                      {shelf.capacity && (
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary rounded-full h-1.5"
                            style={{ width: `${Math.min(100, (shelfClusters / shelf.capacity) * 100)}%` }}
                          />
                        </div>
                      )}
                    </CardHeader>
                    <CardContent className="pt-0">
                      {shelf.lots.length === 0 ? (
                        <p className="text-xs text-text-muted">Trống</p>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex gap-2 text-xs">
                            {shelfMother > 0 && <Badge className="bg-violet-light text-violet-foreground">MM: {shelfMother.toLocaleString("vi-VN")}</Badge>}
                            {shelfFinished > 0 && <Badge className="bg-primary-light text-primary-strong">TP: {shelfFinished.toLocaleString("vi-VN")}</Badge>}
                          </div>
                          <div className="space-y-0.5 mt-1">
                            {shelf.lots.slice(0, 5).map((lot) => {
                              const daysLeft = lot.expectedMoveAt
                                ? differenceInCalendarDays(lot.expectedMoveAt, new Date())
                                : null;
                              return (
                                <div key={lot.id} className="flex items-center justify-between text-xs text-text-secondary">
                                  <span className="font-mono">{lot.code}</span>
                                  <span>{lot.quantity.toLocaleString("vi-VN")}</span>
                                  <span className={expiryClass(lot.expectedMoveAt)}>
                                    {daysLeft === null
                                      ? format(lot.enteredAt, "dd/MM", { locale: vi })
                                      : daysLeft < 0
                                        ? `Quá hạn ${Math.abs(daysLeft)}d`
                                        : daysLeft <= 3
                                          ? `Còn ${daysLeft}d`
                                          : format(lot.enteredAt, "dd/MM", { locale: vi })}
                                  </span>
                                </div>
                              );
                            })}
                            {shelf.lots.length > 5 && (
                              <p className="text-xs text-text-muted">+{shelf.lots.length - 5} lô khác</p>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CollapsibleRoom>
      ))}

      {rooms.length === 0 && (
        <Card><CardContent className="py-12 text-center text-text-muted">
          Chưa có phòng sáng nào
        </CardContent></Card>
      )}
    </div>
  );
}
