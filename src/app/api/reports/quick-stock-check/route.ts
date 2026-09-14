import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPageAllowed } from "@/lib/permissions";
import type { RoomType } from "@prisma/client";

// Quy cách "Cây thành phẩm" (chọn ở FE) = tổng cả 3 quy cách túi thành phẩm cộng lại, không phải 1 quy
// cách cụ thể — xem FINISHED_STAGE_CODES ở production-quick-check.tsx (giữ đúng 1 nguồn duy nhất
// STAGE_OPTIONS phía đó, ở đây chỉ nhận lại và tách ra khi cần).
const ALL_FINISHED_STAGE_CODES = ["T01", "T05", "T10"];

// "Kiểm tra nhanh sản lượng" ở tab Sản lượng (/reports) — số lượng ACTIVE của 1 (kho sản xuất, mã cây,
// quy cách) tại thời điểm gọi, cộng gộp CẢ khu sản xuất (Phòng tối cá nhân của từng NV cấy — hàng chưa
// bàn giao, Phòng mẫu mẹ, Phòng ra rễ — 2 phòng sau là "kho sáng"), không giới hạn theo NV/phòng cụ thể
// nào. Lot.quantity đã tự trừ hàng nhiễm ngay lúc kiểm tra (xem PATCH /api/lot-inspections — trừ thẳng
// contaminatedQuantity khỏi quantity), nên chỉ cần status: ACTIVE là đã loại hàng nhiễm, không cần thêm
// điều kiện gì khác. warehouseId = "ALL" (chọn từ FE) nghĩa là không lọc theo kho — gộp toàn bộ, kèm
// breakdown byWarehouse. plantTypeIds (danh sách id nối dấu phẩy, bỏ trống = mọi loại — FE cho tích chọn
// nhiều loại cây, xem PlantTypeMultiFilter) — breakdown byPlantType hiện khi số loại KHÁC ĐÚNG 1 (0 =
// tất cả, 2+ = nhiều loại tường minh), cùng quy ước với instruction-plan-vs-actual/route.ts.
//
// QUAN TRỌNG (sửa 14/09/2026): lô ở Phòng tối cá nhân (chưa bàn giao) KHÔNG có shelfId — nằm thẳng qua
// Lot.roomId, KHÔNG qua shelf.room như lô đã xếp giàn ở kho sáng. Trước đây where chỉ lọc qua
// `shelf: { room: {...} } }`, tự động BỎ SÓT hoàn toàn mọi lô Phòng tối dù mô tả/comment đã nói rõ phải
// cộng cả 2 — phát hiện qua đối chiếu thực tế mã MS001 (thiếu 3.375/5.555 cụm, gần 2/3 tổng số). Nay dùng
// OR: nhánh 1 = đã xếp giàn (shelf.room), nhánh 2 = Phòng tối trực tiếp (room, shelfId null) VÀ CHƯA có
// phiếu bàn giao nào (transferItems rỗng — đã tạo phiếu thì không còn là "hàng NV đang giữ", dù Kho mô
// chưa xác nhận xong).
//
// Riêng khi kiểm tra M05 (mẫu mẹ), trả thêm `waitingToPlant` ("đang đợi cấy") — KHÁC 2 nhóm trên, không
// phải 1 vị trí vật lý mà là TRẠNG THÁI: phần mẫu mẹ đã gắn vào 1 chỉ định cấy ĐANG THỰC HIỆN (status
// DRAFT/ACTIVE, đã bàn giao — handedOverAt khác null) nhưng CHƯA được NV cấy mô dùng hết (còn dư giữa
// inputMotherQuantity và tổng DailyRecord.motherUsed đã ghi nhận cho đúng chỉ định đó). Lô nguồn của 1 chỉ
// định đã bàn giao tự chuyển status PLANTED (xem markSourceLotsPlanted/instructions route) nên KHÔNG còn
// nằm trong lô ACTIVE ở kho sáng nữa — waitingToPlant không chồng lấn với 2 nhóm trên, đúng "tách biệt 3
// nhóm cộng lại ra tổng mẫu mẹ" NV yêu cầu.
export async function GET(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role ?? null;
  if (!(await isPageAllowed(role, "/reports"))) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId");
  const plantTypeIds = Array.from(
    new Set((searchParams.get("plantTypeIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean))
  );
  const stageCode = searchParams.get("stageCode");
  if (!warehouseId || !stageCode) {
    return NextResponse.json({ message: "Thiếu khu sản xuất/quy cách" }, { status: 400 });
  }
  const isAllFinished = stageCode === "ALL_FINISHED";
  const isAllWarehouses = warehouseId === "ALL";
  const needsPlantTypeBreakdown = plantTypeIds.length !== 1;
  const plantTypeFilter = plantTypeIds.length > 0 ? { in: plantTypeIds } : undefined;

  const lots = await prisma.lot.findMany({
    where: {
      status: "ACTIVE",
      plantTypeId: plantTypeFilter,
      stageCode: isAllFinished ? { in: ALL_FINISHED_STAGE_CODES } : stageCode,
      OR: [
        { shelf: { room: { warehouseId: isAllWarehouses ? undefined : warehouseId } } },
        {
          shelfId: null,
          room: { type: "PHONG_TOI", warehouseId: isAllWarehouses ? undefined : warehouseId },
          transferItems: { none: {} },
        },
      ],
    },
    select: {
      quantity: true,
      stageCode: true,
      shelf: { select: { room: { select: { type: true, warehouse: { select: { code: true, name: true } } } } } },
      room: { select: { type: true, warehouse: { select: { code: true, name: true } } } },
      plantType: { select: { code: true, name: true } },
    },
  });

  const byRoomType: Partial<Record<RoomType, number>> = {};
  const byStageCode: Record<string, number> = {};
  const byWarehouse: Record<string, number> = {};
  const byPlantType: Record<string, number> = {};
  let total = 0;
  for (const lot of lots) {
    const room = lot.shelf?.room ?? lot.room;
    const type = room?.type;
    total += lot.quantity;
    if (type) byRoomType[type] = (byRoomType[type] ?? 0) + lot.quantity;
    if (isAllFinished) byStageCode[lot.stageCode] = (byStageCode[lot.stageCode] ?? 0) + lot.quantity;
    if (isAllWarehouses) {
      const w = room?.warehouse;
      const label = w ? `${w.code} — ${w.name}` : "Khác";
      byWarehouse[label] = (byWarehouse[label] ?? 0) + lot.quantity;
    }
    if (needsPlantTypeBreakdown) {
      const label = `${lot.plantType.code} — ${lot.plantType.name}`;
      byPlantType[label] = (byPlantType[label] ?? 0) + lot.quantity;
    }
  }

  let waitingToPlant: number | undefined;
  if (stageCode === "M05") {
    const instructions = await prisma.plantingInstruction.findMany({
      where: {
        status: { in: ["DRAFT", "ACTIVE"] },
        handedOverAt: { not: null },
        plantTypeId: plantTypeFilter,
        ...(isAllWarehouses ? {} : { items: { some: { shelf: { warehouseId } } } }),
      },
      select: { id: true, inputMotherQuantity: true },
    });
    const instructionIds = instructions.map((i) => i.id);
    const usedAgg = instructionIds.length > 0
      ? await prisma.dailyRecord.groupBy({ by: ["instructionId"], where: { instructionId: { in: instructionIds } }, _sum: { motherUsed: true } })
      : [];
    const usedByInstruction = new Map(usedAgg.map((r) => [r.instructionId, r._sum.motherUsed ?? 0]));
    waitingToPlant = instructions.reduce(
      (sum, inst) => sum + Math.max(0, inst.inputMotherQuantity - (usedByInstruction.get(inst.id) ?? 0)),
      0
    );
  }

  return NextResponse.json({
    total,
    byRoomType,
    ...(isAllFinished ? { byStageCode } : {}),
    ...(isAllWarehouses ? { byWarehouse } : {}),
    ...(needsPlantTypeBreakdown ? { byPlantType } : {}),
    ...(waitingToPlant !== undefined ? { waitingToPlant } : {}),
  });
}
