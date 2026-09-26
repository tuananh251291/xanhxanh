import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, parse, isValid } from "date-fns";

export type PartnerDamagePlantTypeRow = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  receiptDamage: number;
  careDamage: number;
  total: number;
};

export type PartnerDamageReportResult = {
  rangeStart: Date;
  rangeEnd: Date; // exclusive, hết tháng
  receiptDamage: number;
  careDamage: number;
  totalDamage: number;
  byPlantType: PartnerDamagePlantTypeRow[];
};

// Báo cáo "Hỏng hủy" của Kho thị trường (Đối tác vận hành) — gộp 2 nguồn hỏng CHÍNH THỨC (đã duyệt
// xong, số liệu không đổi nữa) trong 1 tháng:
// - "Hỏng khi nhập": RejectedGoodsClassificationItem.destroyQuantity của phiếu đã APPROVED — phần Không
//   đạt lúc "Xác nhận nhận hàng" NV bán hàng đã duyệt Huỷ (xem model RejectedGoodsClassification).
// - "Hỏng do chăm sóc": ContaminationProposal type=HUY đã APPROVED của kho THI_TRUONG — nhiễm/hỏng phát
//   hiện lúc "Kiểm tra định kì hàng tuần" sau khi hàng đã nhập kho (xem ensureWeeklyMarketInspectionTask).
// Dùng approvedAt (không phải createdAt) để tính vào tháng nào — đây là mốc số liệu CHỐT, tránh đếm
// những đề xuất còn PENDING_CLASSIFICATION/PENDING_APPROVAL/PENDING chưa chắc chắn số lượng cuối cùng.
export async function computePartnerDamageReport(
  monthParam?: string | null,
  warehouseIds?: string[] | null
): Promise<PartnerDamageReportResult> {
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const anchor = isValid(parsedMonth) ? parsedMonth : new Date();
  const rangeStart = startOfMonth(anchor);
  const rangeEnd = addDays(endOfMonth(anchor), 1);

  const warehouseFilter = warehouseIds && warehouseIds.length > 0 ? { warehouseId: { in: warehouseIds } } : {};

  const [rejectItems, careProposals] = await Promise.all([
    prisma.rejectedGoodsClassificationItem.findMany({
      where: {
        destroyQuantity: { gt: 0 },
        classification: { status: "APPROVED", approvedAt: { gte: rangeStart, lt: rangeEnd }, ...warehouseFilter },
      },
      select: { destroyQuantity: true, plantTypeId: true, plantType: { select: { code: true, name: true } } },
    }),
    prisma.contaminationProposal.findMany({
      where: {
        type: "HUY",
        status: "APPROVED",
        approvedAt: { gte: rangeStart, lt: rangeEnd },
        warehouse: { type: "THI_TRUONG" },
        ...warehouseFilter,
      },
      select: { quantity: true, plantTypeId: true, plantType: { select: { code: true, name: true } } },
    }),
  ]);

  const byPlantType = new Map<string, PartnerDamagePlantTypeRow>();
  const ensureRow = (id: string, code: string, name: string) => {
    let row = byPlantType.get(id);
    if (!row) {
      row = { plantTypeId: id, plantTypeCode: code, plantTypeName: name, receiptDamage: 0, careDamage: 0, total: 0 };
      byPlantType.set(id, row);
    }
    return row;
  };

  let receiptDamage = 0;
  for (const item of rejectItems) {
    const row = ensureRow(item.plantTypeId, item.plantType.code, item.plantType.name);
    row.receiptDamage += item.destroyQuantity;
    row.total += item.destroyQuantity;
    receiptDamage += item.destroyQuantity;
  }

  let careDamage = 0;
  for (const p of careProposals) {
    const row = ensureRow(p.plantTypeId, p.plantType.code, p.plantType.name);
    row.careDamage += p.quantity;
    row.total += p.quantity;
    careDamage += p.quantity;
  }

  const byPlantTypeRows = Array.from(byPlantType.values()).sort(
    (a, b) => b.total - a.total || a.plantTypeCode.localeCompare(b.plantTypeCode)
  );

  return { rangeStart, rangeEnd, receiptDamage, careDamage, totalDamage: receiptDamage + careDamage, byPlantType: byPlantTypeRows };
}
