export type MotherWeekGroupShelf = {
  id: string;
  code: string;
  name: string;
  plantTypeCode: string | null;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  rowNumber: number | null;
  colNumber: number | null;
  // Khối vật lý (chữ cái hàng + số hàng, VD "A01") — dùng để nhóm/sắp xếp kệ theo đúng thứ tự A, B,
  // C... ngoài thực địa. rowNumber một mình KHÔNG đủ để phân biệt các hàng khác chữ cái (VD hàng "A" và
  // "B" có thể cùng rowNumber=1 nếu tạo riêng 2 lượt) — xem field Shelf.block trong schema.prisma.
  block: string | null;
  lotCount: number;
  quantity: number;
};

export type MotherWeekGroupStatus = {
  groupId: string;
  groupName: string;
  rotationOrder: number | null;
  shelves: MotherWeekGroupShelf[];
  lotCount: number;
  totalQuantity: number;
  isDue: boolean;
};

// Tổng hợp theo Nhóm xoay vòng (rotationGroup, rotationKind = MAU_ME) cho các kệ "đã chia" (Phòng mẫu
// mẹ) của 1 kho — kệ chưa gán Nhóm nào bị bỏ qua hoàn toàn. "Đạt hạn cấy chuyển" = Nhóm có ít nhất 1 lô
// đã đến hạn cấy chuyển theo ĐÚNG thời gian đợi cấy chuyển của mã cây lô đó (Lot.expectedMoveAt, cộng
// PlantType.transferWaitWeeks riêng từng mã cây lúc tạo lô — xem src/lib/mother-ready.ts) — KHÔNG dùng 1
// hằng số tuần chung cho mọi mã cây, giống cách summarizeRootingWeekGroups xử lý Nhóm tuần ra rễ.
export function summarizeMotherWeekGroups(
  shelves: {
    id: string;
    code: string;
    name: string;
    rowNumber: number | null;
    colNumber: number | null;
    block: string | null;
    warehouse: { id: string; code: string; name: string };
    rotationGroup: { id: string; name: string; rotationOrder: number | null } | null;
    plantType: { code: string } | null;
    lots: { quantity: number; expectedMoveAt: Date | null }[];
  }[],
  now: Date = new Date()
): MotherWeekGroupStatus[] {
  const byGroup = new Map<string, MotherWeekGroupStatus>();
  for (const shelf of shelves) {
    if (!shelf.rotationGroup) continue;
    const key = shelf.rotationGroup.id;
    const entry = byGroup.get(key) ?? {
      groupId: key,
      groupName: shelf.rotationGroup.name,
      rotationOrder: shelf.rotationGroup.rotationOrder,
      shelves: [],
      lotCount: 0,
      totalQuantity: 0,
      isDue: false,
    };
    const quantity = shelf.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    entry.shelves.push({
      id: shelf.id,
      code: shelf.code,
      name: shelf.name,
      plantTypeCode: shelf.plantType?.code ?? null,
      warehouseId: shelf.warehouse.id,
      warehouseCode: shelf.warehouse.code,
      warehouseName: shelf.warehouse.name,
      rowNumber: shelf.rowNumber,
      colNumber: shelf.colNumber,
      block: shelf.block,
      lotCount: shelf.lots.length,
      quantity,
    });
    for (const lot of shelf.lots) {
      entry.lotCount += 1;
      entry.totalQuantity += lot.quantity;
      if (lot.expectedMoveAt !== null && lot.expectedMoveAt.getTime() <= now.getTime()) entry.isDue = true;
    }
    byGroup.set(key, entry);
  }

  return Array.from(byGroup.values()).sort((a, b) => (a.rotationOrder ?? 0) - (b.rotationOrder ?? 0));
}

export type MotherDueWarehouseSummary = {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  shelves: MotherWeekGroupShelf[];
  lotCount: number;
  totalQuantity: number;
};

// Gộp các kệ thuộc Nhóm tuần mẫu mẹ đã đến hạn (từ summarizeMotherWeekGroups, đã filter isDue) theo
// khu Sản xuất (Warehouse) — mỗi kho SAN_XUAT là 1 khu, giàn kệ trong từng khu xếp tăng dần theo
// rowNumber/colNumber để KY_THUAT dễ dò theo thứ tự vật lý ngoài thực địa.
export function groupDueMotherShelvesByWarehouse(dueGroups: MotherWeekGroupStatus[]): MotherDueWarehouseSummary[] {
  const byWarehouse = new Map<string, MotherDueWarehouseSummary>();
  for (const group of dueGroups) {
    for (const shelf of group.shelves) {
      const entry = byWarehouse.get(shelf.warehouseId) ?? {
        warehouseId: shelf.warehouseId,
        warehouseCode: shelf.warehouseCode,
        warehouseName: shelf.warehouseName,
        shelves: [],
        lotCount: 0,
        totalQuantity: 0,
      };
      entry.shelves.push(shelf);
      entry.lotCount += shelf.lotCount;
      entry.totalQuantity += shelf.quantity;
      byWarehouse.set(shelf.warehouseId, entry);
    }
  }

  for (const entry of byWarehouse.values()) {
    entry.shelves.sort(
      (a, b) => (a.block ?? "").localeCompare(b.block ?? "") || (a.colNumber ?? 0) - (b.colNumber ?? 0)
    );
  }

  return Array.from(byWarehouse.values()).sort((a, b) => a.warehouseCode.localeCompare(b.warehouseCode));
}
