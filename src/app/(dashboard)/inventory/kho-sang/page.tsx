import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { vi } from "date-fns/locale";
import { STAGE_LABELS, sumLotQuantity } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import type { RoomType } from "@prisma/client";
import CollapsibleRoom from "./collapsible-room";
import SummaryByType from "./summary-by-type";
import MotherShelfTable from "./mother-shelf-table";
import RootingPlantSearch from "./rooting-plant-search";

function expiryClass(expectedMoveAt: Date | null): string {
  if (!expectedMoveAt) return "text-text-muted";
  const daysLeft = differenceInCalendarDays(expectedMoveAt, new Date());
  if (daysLeft < 0) return "text-destructive font-semibold";
  if (daysLeft <= 3) return "text-warning-foreground font-semibold";
  return "text-text-muted";
}

export default async function KhoSangPage({
  searchParams,
}: {
  searchParams: Promise<{ plantTypeId?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/kho-sang"))) redirect("/dashboard");

  const sp = await searchParams;
  const rootingPlantTypeId = sp.plantTypeId?.trim() || null;

  // Nhân viên kỹ thuật chỉ xem được số liệu Phòng mẫu mẹ, không xem được toàn bộ Kho sáng
  // (ẩn Phòng ra rễ — thuộc phạm vi theo dõi của KHO_MO).
  const onlyMotherRoom = role === "KY_THUAT";
  // NV Kho thành phẩm được xem Phòng ra rễ (chỉ xem, không sửa gì ở trang này — trang chỉ đọc) của TẤT
  // CẢ cơ sở sản xuất để chủ động theo dõi hàng sắp về, không xem Phòng mẫu mẹ (không thuộc phạm vi).
  const onlyRootingRoom = role === "KHO_THANH_PHAM";
  // NV kho mô/cấy mô chỉ làm việc với đúng 1 kho sản xuất (nếu đã được Admin gán) — NV kỹ thuật và NV
  // Kho thành phẩm không bị giới hạn theo 1 kho sản xuất (KHO_THANH_PHAM vốn chỉ gán 1 kho THÀNH PHẨM,
  // không phải kho sản xuất, nên phải xem hết mọi kho sản xuất mới có ý nghĩa).
  const workplaceWarehouseId = role !== "KY_THUAT" && role !== "KHO_THANH_PHAM" ? session?.user?.workplaceWarehouseId : null;

  const roomTypeFilter: RoomType | { in: RoomType[] } = onlyMotherRoom
    ? "PHONG_MAU_ME"
    : onlyRootingRoom
      ? "PHONG_RA_RE"
      : { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] };

  // Chỉ tải danh sách phòng (nhẹ) — KHÔNG kèm shelves/lots nữa, vì có phòng tới 600+ kệ khiến trang tải
  // ~9 giây. Phòng mẫu mẹ giờ tự tải kệ theo trang qua GET /api/shelves/mother-room (xem MotherShelfTable).
  const rooms = await prisma.room.findMany({
    where: {
      type: roomTypeFilter,
      isActive: true,
      ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
    },
    include: { warehouse: { select: { name: true } } },
    orderBy: [{ warehouse: { name: "asc" } }],
  });

  // Số liệu tổng ("Tổng: X lô...", bảng theo loại cây) tính bằng groupBy/aggregate trực tiếp trên DB
  // thay vì tải hết lô vào bộ nhớ rồi cộng bằng JS như trước — cùng phạm vi phòng/kho với rooms ở trên.
  const lotWhere = {
    status: "ACTIVE" as const,
    shelf: {
      room: {
        type: roomTypeFilter,
        isActive: true,
        ...(workplaceWarehouseId ? { warehouseId: workplaceWarehouseId } : {}),
      },
    },
  };
  const [lotAgg, totalLotCount] = await Promise.all([
    prisma.lot.groupBy({ by: ["plantTypeId", "stage"], where: lotWhere, _sum: { quantity: true } }),
    prisma.lot.count({ where: lotWhere }),
  ]);
  const totalMother = lotAgg.filter((a) => a.stage === "MAU_ME").reduce((s, a) => s + (a._sum?.quantity ?? 0), 0);
  const totalFinished = lotAgg.filter((a) => a.stage === "THANH_PHAM").reduce((s, a) => s + (a._sum?.quantity ?? 0), 0);

  const plantTypeIds = [...new Set(lotAgg.map((a) => a.plantTypeId))];
  const plantTypeNames = plantTypeIds.length
    ? await prisma.plantType.findMany({ where: { id: { in: plantTypeIds } }, select: { id: true, code: true, name: true } })
    : [];
  const plantTypeById = new Map(plantTypeNames.map((p) => [p.id, p]));
  const summaryByTypeEntries = (() => {
    const byType: Record<string, { name: string; mother: number; finished: number }> = {};
    for (const a of lotAgg) {
      const pt = plantTypeById.get(a.plantTypeId);
      if (!pt) continue;
      if (!byType[a.plantTypeId]) byType[a.plantTypeId] = { name: `${pt.name} (${pt.code})`, mother: 0, finished: 0 };
      if (a.stage === "MAU_ME") byType[a.plantTypeId].mother += a._sum?.quantity ?? 0;
      else byType[a.plantTypeId].finished += a._sum?.quantity ?? 0;
    }
    return Object.values(byType);
  })();
  const rootingPlantTypeOptions = plantTypeNames
    .map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Phòng ra rễ (chỉ KHO_MO xem, KY_THUAT không có) vẫn hiển thị dạng thẻ theo kệ như cũ, ít kệ hơn nhiều
  // so với Phòng mẫu mẹ nên chưa cần phân trang — tải riêng, không dính vào query rooms ở trên nữa.
  const raReRoomIds = rooms.filter((r) => r.type === "PHONG_RA_RE").map((r) => r.id);
  // Tìm theo mã cây (RootingPlantSearch, ?plantTypeId=) — lọc NGAY ở query: chỉ tải kệ có ít nhất 1 lô
  // đúng mã cây đó (bớt hẳn kệ khác trong danh sách thay vì hiện "Trống" gây rối), và trong 1 kệ có
  // nhiều mã cây khác nhau (Phòng ra rễ không có plantTypeId cố định như Phòng mẫu mẹ) chỉ hiện đúng lô
  // khớp mã cây đang tìm, không lẫn lô mã cây khác trên cùng kệ.
  const raReShelves = raReRoomIds.length
    ? await prisma.shelf.findMany({
        where: {
          roomId: { in: raReRoomIds },
          isActive: true,
          ...(rootingPlantTypeId
            ? { lots: { some: { status: "ACTIVE", quantity: { gt: 0 }, plantTypeId: rootingPlantTypeId } } }
            : {}),
        },
        include: {
          plantType: { select: { name: true } },
          assignedStaff: { select: { name: true } },
          lots: {
            // quantity > 0 — xem giải thích ở src/app/(dashboard)/warehouses/page.tsx cùng shelfInclude.
            where: { status: "ACTIVE", quantity: { gt: 0 }, ...(rootingPlantTypeId ? { plantTypeId: rootingPlantTypeId } : {}) },
            include: { plantType: { select: { code: true, name: true } } },
            orderBy: { enteredAt: "asc" },
          },
        },
        orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
      })
    : [];
  const raReShelvesByRoom = new Map<string, typeof raReShelves>();
  for (const shelf of raReShelves) {
    const list = raReShelvesByRoom.get(shelf.roomId!) ?? [];
    list.push(shelf);
    raReShelvesByRoom.set(shelf.roomId!, list);
  }

  const motherRoomIds = rooms.filter((r) => r.type === "PHONG_MAU_ME").map((r) => r.id);
  const [assignedCounts, unassignedCounts] = await Promise.all([
    Promise.all(motherRoomIds.map((id) => prisma.shelf.count({ where: { roomId: id, isActive: true, assignedStaffId: { not: null } } }))),
    Promise.all(motherRoomIds.map((id) => prisma.shelf.count({ where: { roomId: id, isActive: true, assignedStaffId: null } }))),
  ]);
  const assignedCountByRoom = new Map(motherRoomIds.map((id, i) => [id, assignedCounts[i]]));
  const unassignedCountByRoom = new Map(motherRoomIds.map((id, i) => [id, unassignedCounts[i]]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sun className="w-6 h-6 text-warning-foreground" />
          {onlyMotherRoom ? "Phòng mẫu mẹ" : onlyRootingRoom ? "Phòng ra rễ — tất cả cơ sở sản xuất" : "Phòng sáng"}
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {onlyMotherRoom
            ? `Tổng: ${totalLotCount} lô · Mẫu mẹ: ${totalMother.toLocaleString("vi-VN")} cụm`
            : onlyRootingRoom
              ? `Tổng: ${totalLotCount} lô · Thành phẩm: ${totalFinished.toLocaleString("vi-VN")} cây`
              : `Tổng: ${totalLotCount} lô · Mẫu mẹ: ${totalMother.toLocaleString("vi-VN")} cụm · Thành phẩm: ${totalFinished.toLocaleString("vi-VN")} cây`}
        </p>
      </div>

      {/* Summary by plant type */}
      <SummaryByType entries={summaryByTypeEntries} />

      {/* Tìm nhanh 1 mã cây trong Phòng ra rễ — không có ý nghĩa gì ở chế độ chỉ xem Phòng mẫu mẹ. */}
      {!onlyMotherRoom && <RootingPlantSearch plantTypeOptions={rootingPlantTypeOptions} />}

      {/* Per phòng sáng and shelf */}
      {rooms.map((room) => (
        <CollapsibleRoom key={room.id} title={`${room.warehouse.name} — ${room.name}`}>
          {room.type === "PHONG_MAU_ME" ? (
            (assignedCountByRoom.get(room.id) ?? 0) + (unassignedCountByRoom.get(room.id) ?? 0) === 0 ? (
              <p className="text-sm text-text-muted pl-2">Chưa có kệ</p>
            ) : (
              <div className="space-y-4">
                <MotherShelfTable
                  roomId={room.id}
                  assigned
                  label="Kho mẫu mẹ đã chia"
                  emptyLabel="Chưa có kệ nào được gán nhân viên"
                />
                <MotherShelfTable
                  roomId={room.id}
                  assigned={false}
                  label="Kho mẫu mẹ chung"
                  emptyLabel="Không còn kệ nào chưa gán nhân viên"
                />
              </div>
            )
          ) : (raReShelvesByRoom.get(room.id) ?? []).length === 0 ? (
            <p className="text-sm text-text-muted pl-2">Chưa có kệ</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {(raReShelvesByRoom.get(room.id) ?? []).map((shelf) => {
                const shelfMother = sumLotQuantity(shelf.lots.filter((l) => l.stage === "MAU_ME"));
                const shelfFinished = sumLotQuantity(shelf.lots.filter((l) => l.stage === "THANH_PHAM"));
                // Nhánh này chỉ vẽ Phòng ra rễ (Phòng mẫu mẹ đã có bảng riêng ở trên) — sức chứa kệ tính
                // theo cây, cộng thẳng quantity không quy đổi (shelfMother gần như luôn = 0 ở đây vì
                // Phòng ra rễ không lưu lô mẫu mẹ).
                const shelfUnits = shelfMother + shelfFinished;
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
                            style={{ width: `${Math.min(100, (shelfUnits / shelf.capacity) * 100)}%` }}
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
                            {shelfMother > 0 && <Badge className="bg-violet-light text-violet-foreground">MM: {shelfMother.toLocaleString("vi-VN")} cụm</Badge>}
                            {shelfFinished > 0 && <Badge className="bg-primary-light text-primary-strong">TP: {shelfFinished.toLocaleString("vi-VN")} cây</Badge>}
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
