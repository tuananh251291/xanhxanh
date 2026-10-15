import { prisma } from "@/lib/prisma";
import { getProcessingRoom } from "@/lib/finished-goods";

// Dữ liệu cho nhiệm vụ tuần của Quản lý kho thành phẩm (QLK_DE_XUAT_TUAN, xem
// /task-assignment/qlk-de-xuat/[taskId] + POST /api/finished-goods-weekly/[taskId]):
// - destroyGroups: phần "Đề xuất hủy" từ phiếu kiểm tra tuần của NV (FinishedGoodsCheckLine) CHƯA được gộp,
//   cộng theo mã cây + quy cách — mọi tuần chưa gộp đều dồn vào đây (tuần trước lỡ hạn vẫn hiện tiếp).
// - processingStock: tồn hiện tại của Phòng chờ xử lý theo mã cây + quy cách — nguồn cho Đề xuất trồng và
//   Phiếu xử lý.
export async function getManagerWeeklyData(warehouseId: string) {
  const processingRoom = await getProcessingRoom(warehouseId);

  const [pendingLines, processingLots, gardens, productionWarehouses] = await Promise.all([
    prisma.finishedGoodsCheckLine.findMany({
      where: { warehouseId, destroyConsumedAt: null, destroyQuantity: { gt: 0 } },
      select: {
        plantTypeId: true, stageCode: true, destroyQuantity: true,
        plantType: { select: { code: true, name: true } },
        createdBy: { select: { name: true } },
        sourceRoom: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    processingRoom
      ? prisma.lot.findMany({
          where: { roomId: processingRoom.id, status: "ACTIVE", quantity: { gt: 0 } },
          select: { plantTypeId: true, stageCode: true, quantity: true, plantType: { select: { code: true, name: true } } },
        })
      : Promise.resolve([]),
    prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { type: "SAN_XUAT", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  type DestroyGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; total: number; sources: string[] };
  const destroyMap = new Map<string, DestroyGroup>();
  for (const l of pendingLines) {
    const key = `${l.plantTypeId}:${l.stageCode}`;
    const g = destroyMap.get(key) ?? { plantTypeId: l.plantTypeId, plantTypeCode: l.plantType.code, plantTypeName: l.plantType.name, stageCode: l.stageCode, total: 0, sources: [] };
    g.total += l.destroyQuantity;
    const src = `${l.createdBy.name} (${l.sourceRoom.name})`;
    if (!g.sources.includes(src)) g.sources.push(src);
    destroyMap.set(key, g);
  }

  type StockGroup = { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number };
  const stockMap = new Map<string, StockGroup>();
  for (const l of processingLots) {
    const key = `${l.plantTypeId}:${l.stageCode}`;
    const g = stockMap.get(key) ?? { plantTypeId: l.plantTypeId, plantTypeCode: l.plantType.code, plantTypeName: l.plantType.name, stageCode: l.stageCode, quantity: 0 };
    g.quantity += l.quantity;
    stockMap.set(key, g);
  }

  const byCode = (a: { plantTypeCode: string; stageCode: string }, b: { plantTypeCode: string; stageCode: string }) =>
    a.plantTypeCode === b.plantTypeCode ? a.stageCode.localeCompare(b.stageCode) : a.plantTypeCode.localeCompare(b.plantTypeCode);

  return {
    processingRoom,
    destroyGroups: [...destroyMap.values()].sort(byCode),
    processingStock: [...stockMap.values()].sort(byCode),
    gardens,
    productionWarehouses,
  };
}
