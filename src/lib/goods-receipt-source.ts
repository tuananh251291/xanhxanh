type Named = { name: string; code: string } | null | undefined;

// Tên "Đơn vị cung cấp" của 1 phiếu nhập hàng — đúng 1 trong 3 có giá trị: NCC ngoài, Vườn/Khu SX nội bộ
// (ProductionGarden) hoặc khu sản xuất (Warehouse SAN_XUAT), xem GoodsReceipt trong prisma/schema.prisma.
export function goodsReceiptSourceLabel(source: { supplier?: Named; productionGarden?: Named; productionWarehouse?: Named }): string {
  if (source.supplier) return `${source.supplier.name} (${source.supplier.code})`;
  if (source.productionGarden) return `${source.productionGarden.name} (${source.productionGarden.code}) — Khu SX nội bộ`;
  if (source.productionWarehouse) return `${source.productionWarehouse.name} (${source.productionWarehouse.code}) — Khu sản xuất`;
  return "—";
}
