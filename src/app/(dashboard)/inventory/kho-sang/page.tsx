import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sun } from "lucide-react";
import { format, differenceInCalendarDays, addWeeks } from "date-fns";
import { vi } from "date-fns/locale";
import { STAGE_LABELS, sumLotQuantity, isKhoThanhPhamRole } from "@/types";
import { isPageAllowed } from "@/lib/permissions";
import { isoWeekStringToMonday } from "@/lib/week-rotation";
import type { RoomType } from "@prisma/client";
import CollapsibleRoom from "./collapsible-room";
import SummaryByType from "./summary-by-type";
import MotherShelfTable from "./mother-shelf-table";
import RootingPlantSearch from "./rooting-plant-search";
import ShelfTable from "../../warehouses/shelf-table";

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
  searchParams: Promise<{ plantTypeId?: string; enteredWeekFrom?: string; enteredWeekTo?: string; warehouseId?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/inventory/kho-sang"))) redirect("/dashboard");
  // Chỉ Quản lý kho thành phẩm được xem Phòng ra rễ mọi cơ sở — NV kho thành phẩm thường bỏ quyền này
  // (isKhoThanhPhamRole gộp chung 2 role nên phải chặn riêng ở đây, không sửa lại helper dùng chung).
  if (role === "KHO_THANH_PHAM") redirect("/dashboard");

  const sp = await searchParams;
  const rawPlantTypeId = sp.plantTypeId?.trim() || null;
  // "__ALL__" = mục "Chọn tất cả mã cây" trong RootingPlantSearch — không lọc theo mã cây (giống null)
  // nhưng vẫn bật bảng tổng hợp chi tiết theo mã cây + quy cách (xem finishedByPlantStageRows dưới).
  const isAllRooting = rawPlantTypeId === "__ALL__";
  const rootingPlantTypeId = isAllRooting ? null : rawPlantTypeId;
  // Khoảng "Tuần nhập lên kho sáng" (input type="week", "YYYY-Www") — lọc thành phẩm Phòng ra rễ theo
  // đúng Lot.enteredAt (ngày lên kệ kho sáng, xem commitShelfPlacements) từ tuần này ĐẾN tuần kia (2 mốc
  // độc lập, chỉ nhập 1 trong 2 vẫn lọc được 1 phía). null/không hợp lệ = không lọc theo mốc đó.
  const enteredWeekFromParam = sp.enteredWeekFrom?.trim() || null;
  const enteredWeekToParam = sp.enteredWeekTo?.trim() || null;
  const enteredWeekFromMonday = enteredWeekFromParam ? isoWeekStringToMonday(enteredWeekFromParam) : null;
  const enteredWeekToMonday = enteredWeekToParam ? isoWeekStringToMonday(enteredWeekToParam) : null;
  // Mốc "đến" là CUỐI tuần đó — cộng thêm 1 tuần vào Thứ 2 để làm biên trên loại trừ (lt).
  const enteredWeekToExclusiveEnd = enteredWeekToMonday ? addWeeks(enteredWeekToMonday, 1) : null;
  // Kho sản xuất được Quản lý kho thành phẩm chọn để xem Phòng ra rễ (RootingPlantSearch, ?warehouseId=)
  // — chỉ có ý nghĩa với onlyRootingRoom bên dưới, để trống = giữ hành vi cũ gộp mọi cơ sở.
  const rawWarehouseId = sp.warehouseId?.trim() || null;
  const enteredAtFilter =
    enteredWeekFromMonday || enteredWeekToExclusiveEnd
      ? {
          ...(enteredWeekFromMonday ? { gte: enteredWeekFromMonday } : {}),
          ...(enteredWeekToExclusiveEnd ? { lt: enteredWeekToExclusiveEnd } : {}),
        }
      : undefined;

  // Nhân viên kỹ thuật chỉ xem được số liệu Phòng mẫu mẹ, không xem được toàn bộ Kho sáng
  // (ẩn Phòng ra rễ — thuộc phạm vi theo dõi của KHO_MO).
  const onlyMotherRoom = role === "KY_THUAT";
  // NV Kho thành phẩm được xem Phòng ra rễ (chỉ xem, không sửa gì ở trang này — trang chỉ đọc) của TẤT
  // CẢ cơ sở sản xuất để chủ động theo dõi hàng sắp về, không xem Phòng mẫu mẹ (không thuộc phạm vi).
  const onlyRootingRoom = isKhoThanhPhamRole(role);
  // NV kho mô/cấy mô chỉ làm việc với đúng 1 kho sản xuất (nếu đã được Admin gán) — NV kỹ thuật và NV/Quản
  // lý Kho thành phẩm không bị giới hạn theo 1 kho sản xuất (isKhoThanhPhamRole vốn chỉ gán 1 kho THÀNH
  // PHẨM, không phải kho sản xuất, nên phải xem hết mọi kho sản xuất mới có ý nghĩa) — trừ khi Quản lý
  // kho thành phẩm chủ động chọn đúng 1 kho qua rawWarehouseId, lúc đó lọc y như đang làm việc tại kho đó
  // (cùng cơ chế viewOnly ShelfTable với NV kho mô, xem nhánh render bên dưới).
  const workplaceWarehouseId = onlyRootingRoom
    ? rawWarehouseId
    : role !== "KY_THUAT" && !isKhoThanhPhamRole(role) ? session?.user?.workplaceWarehouseId : null;

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

  // Danh sách kho sản xuất cho ô chọn của Quản lý kho thành phẩm (RootingPlantSearch) — chỉ cần tải khi
  // onlyRootingRoom, NV kho mô/kỹ thuật không thấy ô chọn này nên khỏi tốn truy vấn.
  const rootingWarehouseOptions = onlyRootingRoom
    ? (
        await prisma.warehouse.findMany({
          where: { type: "SAN_XUAT", isActive: true, rooms: { some: { type: "PHONG_RA_RE", isActive: true } } },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        })
      ).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))
    : [];

  // Phòng ra rễ (chỉ KHO_MO xem, KY_THUAT không có) vẫn hiển thị dạng thẻ theo kệ như cũ, ít kệ hơn nhiều
  // so với Phòng mẫu mẹ nên chưa cần phân trang — tải riêng, không dính vào query rooms ở trên nữa.
  const raReRoomIds = rooms.filter((r) => r.type === "PHONG_RA_RE").map((r) => r.id);
  // Tìm theo mã cây (RootingPlantSearch, ?plantTypeId=) — lọc NGAY ở query: chỉ tải kệ có ít nhất 1 lô
  // đúng mã cây đó (bớt hẳn kệ khác trong danh sách thay vì hiện "Trống" gây rối), và trong 1 kệ có
  // nhiều mã cây khác nhau (Phòng ra rễ không có plantTypeId cố định như Phòng mẫu mẹ) chỉ hiện đúng lô
  // khớp mã cây đang tìm, không lẫn lô mã cây khác trên cùng kệ.
  const raReLotFilter = {
    status: "ACTIVE" as const,
    quantity: { gt: 0 },
    ...(rootingPlantTypeId ? { plantTypeId: rootingPlantTypeId } : {}),
    ...(enteredAtFilter ? { enteredAt: enteredAtFilter } : {}),
  };
  const raReShelves = raReRoomIds.length
    ? await prisma.shelf.findMany({
        where: {
          roomId: { in: raReRoomIds },
          isActive: true,
          ...((rootingPlantTypeId || enteredAtFilter) ? { lots: { some: raReLotFilter } } : {}),
        },
        include: {
          plantType: { select: { id: true, code: true, name: true } },
          assignedStaff: { select: { id: true, code: true, name: true } },
          // Chỉ thật sự cần khi hiện dạng bảng giống Admin cho Kho mô (xem ShelfTable bên dưới) — vẫn fetch
          // chung cho gọn, không tốn thêm truy vấn riêng.
          rotationGroup: { select: { id: true, name: true, rotationOrder: true } },
          lots: {
            // quantity > 0 — xem giải thích ở src/app/(dashboard)/warehouses/page.tsx cùng shelfInclude.
            where: raReLotFilter,
            include: { plantType: { select: { code: true, name: true } } },
            orderBy: { enteredAt: "asc" },
          },
        },
        // block (VD "A01"/"A02") PHẢI đứng trước rowNumber — rowNumber chỉ là phần số của block (reset về
        // 1 ở mỗi chữ cái hàng khác nhau, xem POST /api/shelves), sắp mỗi mình rowNumber sẽ trộn lẫn "A01,
        // B01, A02, B02..." thay vì đúng thứ tự vật lý "A01C01..A01C10, A02C01...". Khớp đúng orderBy đã
        // dùng ở rooms/[roomId]/shelf-list-view.tsx (trang Admin).
        orderBy: [{ block: "asc" }, { rowNumber: "asc" }, { colNumber: "asc" }],
      })
    : [];
  const raReShelvesByRoom = new Map<string, typeof raReShelves>();
  // Tổng hợp theo QUY CÁCH (stageCode, VD T01/T05/T10) — không phân biệt theo giàn kệ, đúng dạng "danh
  // sách" NV cần khi xem theo khoảng tuần (1 khoảng tuần có thể trải hàng chục giàn, gộp lại mới hữu ích).
  const finishedByStageCode = new Map<string, { quantity: number; lotCount: number }>();
  // Tổng hợp theo MÃ CÂY + quy cách — dùng cho box "Tổng hợp cây ra rễ tại kho sáng" khi chọn "Chọn tất
  // cả mã cây" (isAllRooting), vì lúc đó bảng theo quy cách ở trên gộp lẫn nhiều mã cây khác nhau.
  const finishedByPlantStage = new Map<string, { plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number; lotCount: number }>();
  for (const shelf of raReShelves) {
    const list = raReShelvesByRoom.get(shelf.roomId!) ?? [];
    list.push(shelf);
    raReShelvesByRoom.set(shelf.roomId!, list);
    for (const lot of shelf.lots) {
      if (lot.stage !== "THANH_PHAM") continue;
      const stageEntry = finishedByStageCode.get(lot.stageCode) ?? { quantity: 0, lotCount: 0 };
      stageEntry.quantity += lot.quantity;
      stageEntry.lotCount += 1;
      finishedByStageCode.set(lot.stageCode, stageEntry);

      const plantKey = `${lot.plantTypeId}|${lot.stageCode}`;
      const plantEntry = finishedByPlantStage.get(plantKey) ?? {
        plantTypeCode: lot.plantType.code,
        plantTypeName: lot.plantType.name,
        stageCode: lot.stageCode,
        quantity: 0,
        lotCount: 0,
      };
      plantEntry.quantity += lot.quantity;
      plantEntry.lotCount += 1;
      finishedByPlantStage.set(plantKey, plantEntry);
    }
  }
  const finishedByStageCodeRows = Array.from(finishedByStageCode.entries())
    .map(([stageCode, v]) => ({ stageCode, ...v }))
    .sort((a, b) => a.stageCode.localeCompare(b.stageCode));
  const finishedByPlantStageRows = Array.from(finishedByPlantStage.values())
    .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode) || a.stageCode.localeCompare(b.stageCode));
  const filteredFinishedTotal = finishedByStageCodeRows.reduce((s, r) => s + r.quantity, 0);
  const filteredFinishedLotCount = finishedByStageCodeRows.reduce((s, r) => s + r.lotCount, 0);
  const hasRootingFilter = !!rootingPlantTypeId || !!enteredAtFilter;

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
          {onlyMotherRoom
            ? "Phòng mẫu mẹ"
            : onlyRootingRoom
              ? rawWarehouseId
                ? `Phòng ra rễ — ${rooms[0]?.warehouse.name ?? ""}`
                : "Phòng ra rễ — tất cả cơ sở sản xuất"
              : "Phòng sáng"}
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          {onlyMotherRoom
            ? `Tổng: ${totalLotCount} lô · Mẫu mẹ: ${totalMother.toLocaleString("vi-VN")} cụm`
            : onlyRootingRoom
              ? `Tổng: ${totalLotCount} lô · Thành phẩm: ${totalFinished.toLocaleString("vi-VN")} cây`
              : `Tổng: ${totalLotCount} lô · Mẫu mẹ: ${totalMother.toLocaleString("vi-VN")} cụm · Thành phẩm: ${totalFinished.toLocaleString("vi-VN")} cây`}
        </p>
      </div>

      {/* Summary by plant type — Kho thành phẩm xem Phòng ra rễ mọi cơ sở đã có bảng "Tổng hợp cây ra
          rễ tại kho sáng" chi tiết hơn (theo mã cây + quy cách) ngay bên dưới, nên bỏ khối này ở đây. */}
      {!onlyRootingRoom && <SummaryByType entries={summaryByTypeEntries} />}

      {/* Tìm nhanh 1 mã cây + lọc theo tuần nhập lên kho sáng trong Phòng ra rễ — không có ý nghĩa gì ở
          chế độ chỉ xem Phòng mẫu mẹ. */}
      {!onlyMotherRoom && (
        <div className="space-y-3">
          <RootingPlantSearch
            plantTypeOptions={rootingPlantTypeOptions}
            warehouseOptions={onlyRootingRoom ? rootingWarehouseOptions : undefined}
          />
          {!isAllRooting && hasRootingFilter && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tổng hợp theo quy cách</CardTitle>
                <p className="text-sm text-text-secondary">
                  Khớp bộ lọc: <strong className="text-primary-strong">{filteredFinishedTotal.toLocaleString("vi-VN")} cây</strong> thành phẩm
                  {" "}({filteredFinishedLotCount.toLocaleString("vi-VN")} lô, không phân biệt giàn kệ)
                </p>
              </CardHeader>
              <CardContent>
                {finishedByStageCodeRows.length === 0 ? (
                  <p className="text-sm text-text-muted">Không có thành phẩm nào khớp bộ lọc</p>
                ) : (
                  <table className="w-full text-sm max-w-md">
                    <thead>
                      <tr className="bg-primary-light text-left text-primary-strong">
                        <th className="py-2 px-3 font-bold text-base">Quy cách</th>
                        <th className="py-2 px-3 font-bold text-base text-right">Số lượng (cây)</th>
                        <th className="py-2 px-3 font-bold text-base text-right">Số lô</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finishedByStageCodeRows.map((r) => (
                        <tr key={r.stageCode} className="border-b last:border-0 even:bg-primary-light/30">
                          <td className="py-2 px-3"><Badge variant="secondary">{r.stageCode}</Badge></td>
                          <td className="py-2 px-3 text-right font-medium tabular-nums">{r.quantity.toLocaleString("vi-VN")}</td>
                          <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{r.lotCount.toLocaleString("vi-VN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          )}
          {isAllRooting && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Tổng hợp cây ra rễ tại kho sáng</CardTitle>
                <p className="text-sm text-text-secondary">
                  Tổng: <strong className="text-primary-strong">{filteredFinishedTotal.toLocaleString("vi-VN")} cây</strong> thành phẩm
                  {" "}({filteredFinishedLotCount.toLocaleString("vi-VN")} lô, không phân biệt giàn kệ)
                </p>
              </CardHeader>
              <CardContent>
                {finishedByPlantStageRows.length === 0 ? (
                  <p className="text-sm text-text-muted">Chưa có thành phẩm nào trong Phòng ra rễ</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-light text-left text-primary-strong">
                          <th className="py-2 px-3 font-bold text-base">Mã cây</th>
                          <th className="py-2 px-3 font-bold text-base">Tên cây</th>
                          <th className="py-2 px-3 font-bold text-base">Quy cách</th>
                          <th className="py-2 px-3 font-bold text-base text-right">Số lượng (cây)</th>
                          <th className="py-2 px-3 font-bold text-base text-right">Số lô</th>
                        </tr>
                      </thead>
                      <tbody>
                        {finishedByPlantStageRows.map((r) => (
                          <tr key={`${r.plantTypeCode}|${r.stageCode}`} className="border-b last:border-0 even:bg-primary-light/30">
                            <td className="py-2 px-3 font-mono">{r.plantTypeCode}</td>
                            <td className="py-2 px-3">{r.plantTypeName}</td>
                            <td className="py-2 px-3"><Badge variant="secondary">{r.stageCode}</Badge></td>
                            <td className="py-2 px-3 text-right font-medium tabular-nums">{r.quantity.toLocaleString("vi-VN")}</td>
                            <td className="py-2 px-3 text-right text-text-secondary tabular-nums">{r.lotCount.toLocaleString("vi-VN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
          ) : role === "KHO_MO" || (onlyRootingRoom && !!rawWarehouseId) ? (
            // Kho mô xem Phòng ra rễ theo đúng dạng bảng Admin đang dùng (xem ShelfTable, dùng chung với
            // /warehouses/rooms/[roomId]) thay vì dạng thẻ — nhưng viewOnly nên không có ô sửa sức chứa,
            // không đổi Nhóm tuần, không chuyển phòng, không xóa kệ; chỉ xem được chi tiết lô cây (nút mắt).
            // Quản lý kho thành phẩm cũng thấy dạng bảng này khi đã chọn đúng 1 kho sản xuất qua bộ lọc ở
            // trên (rawWarehouseId) — chưa chọn thì vẫn giữ dạng thẻ gộp mọi cơ sở như cũ (nhánh else).
            <ShelfTable
              shelves={raReShelvesByRoom.get(room.id) ?? []}
              currentRoomId={room.id}
              currentRoomType="PHONG_RA_RE"
              viewOnly
            />
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
