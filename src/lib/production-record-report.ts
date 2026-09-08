import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, eachDayOfInterval, parse, isValid, format } from "date-fns";

// Báo cáo "Số lượng ghi nhận" của NV cấy mô — KHÁC "Dữ liệu nhật ký cấy" (planting-log-summary, tính trên
// DailyRecordItem.quantityCreated = số cấy RA thô) ở chỗ đây tính đúng số lượng "ĐƯỢC GHI NHẬN" (tính vào
// sản lượng/KPI) — luồng Xanh tự khai trừ hàng không đạt, luồng Đỏ/Vàng dùng số Kho mô đã CREDIT sau kiểm
// tra (TransferInspectionItem.creditedQuantity, chỉ tính khi đã có phiếu kiểm tra) — CÙNG khái niệm và
// công thức "ghi nhận" đang dùng ở Bảng lương (xem computePayrollForPeriod trong payroll-calculation.ts),
// nhưng KHÔNG quy đổi ra VNĐ — chỉ thuần số lượng, dùng cho báo cáo sản xuất (không phải dữ liệu lương
// nhạy cảm) nên mở quyền xem rộng hơn Bảng lương.
export type ProductionRecordDailyEntry = {
  date: string; // yyyy-MM-dd
  active: boolean; // có nhật ký cấy hoặc bàn giao phòng tối trong ngày
  recordedQuantity: number;
  unqualifiedQuantity: number;
};

export type ProductionRecordPlantTypeBreakdown = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  quantity: number;
};

export type ProductionRecordRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  totalRecordedQuantity: number;
  totalUnqualifiedQuantity: number;
  byPlantType: ProductionRecordPlantTypeBreakdown[];
  dailyDetail: ProductionRecordDailyEntry[];
};

export type ProductionRecordResult = {
  rangeStart: Date;
  rangeEnd: Date; // bao gồm hết ngày cuối tháng
  rows: ProductionRecordRow[];
};

function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export async function computeProductionRecordForPeriod(monthParam?: string | null, warehouseId?: string): Promise<ProductionRecordResult> {
  const parsedMonth = monthParam ? parse(monthParam, "yyyy-MM", new Date()) : new Date();
  const anchor = isValid(parsedMonth) ? parsedMonth : new Date();
  const rangeStart = startOfMonth(anchor);
  const rangeEndInclusive = endOfMonth(anchor);
  const rangeEndExclusive = addDays(rangeEndInclusive, 1);

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
    select: { id: true, code: true, name: true, inspectionLane: true, workplaceWarehouse: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  if (staffList.length === 0) return { rangeStart, rangeEnd: rangeEndExclusive, rows: [] };
  const staffIds = staffList.map((s) => s.id);
  const laneByStaff = new Map(staffList.map((s) => [s.id, s.inspectionLane]));

  const [dailyRecords, transfers] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { staffId: { in: staffIds }, recordDate: { gte: rangeStart, lt: rangeEndExclusive } },
      select: { staffId: true, recordDate: true },
    }),
    prisma.transfer.findMany({
      where: { fromUserId: { in: staffIds }, fromRoom: { type: "PHONG_TOI" }, createdAt: { gte: rangeStart, lt: rangeEndExclusive } },
      select: {
        fromUserId: true,
        createdAt: true,
        items: { select: { quantity: true, unqualifiedQuantity: true, lot: { select: { plantTypeId: true, plantType: { select: { code: true, name: true } } } } } },
        inspection: { select: { items: { select: { plantTypeId: true, creditedQuantity: true, plantType: { select: { code: true, name: true } } } } } },
      },
    }),
  ]);

  const daysInPeriod = eachDayOfInterval({ start: rangeStart, end: rangeEndInclusive });

  const dailyMap = new Map<string, Map<string, { active: boolean; quantity: number; unqualified: number }>>();
  const ensureDayEntry = (staffId: string, day: string) => {
    const staffMap = dailyMap.get(staffId) ?? new Map<string, { active: boolean; quantity: number; unqualified: number }>();
    if (!staffMap.has(day)) staffMap.set(day, { active: false, quantity: 0, unqualified: 0 });
    dailyMap.set(staffId, staffMap);
    return staffMap.get(day)!;
  };
  for (const r of dailyRecords) ensureDayEntry(r.staffId, dayKey(r.recordDate)).active = true;

  const plantTypeMetaById = new Map<string, { code: string; name: string }>();
  const byStaffAndPlant = new Map<string, Map<string, number>>();
  const addRecorded = (staffId: string, plantTypeId: string, code: string, name: string, qty: number) => {
    plantTypeMetaById.set(plantTypeId, { code, name });
    const m = byStaffAndPlant.get(staffId) ?? new Map<string, number>();
    m.set(plantTypeId, (m.get(plantTypeId) ?? 0) + qty);
    byStaffAndPlant.set(staffId, m);
  };

  for (const t of transfers) {
    const isXanh = laneByStaff.get(t.fromUserId) === "XANH";
    const dayEntry = ensureDayEntry(t.fromUserId, dayKey(t.createdAt));
    dayEntry.active = true;
    if (isXanh) {
      for (const item of t.items) {
        const credited = item.quantity - item.unqualifiedQuantity;
        addRecorded(t.fromUserId, item.lot.plantTypeId, item.lot.plantType.code, item.lot.plantType.name, credited);
        dayEntry.quantity += credited;
        dayEntry.unqualified += item.unqualifiedQuantity;
      }
    } else if (t.inspection) {
      for (const insItem of t.inspection.items) {
        addRecorded(t.fromUserId, insItem.plantTypeId, insItem.plantType.code, insItem.plantType.name, insItem.creditedQuantity);
        dayEntry.quantity += insItem.creditedQuantity;
      }
    }
    // Luồng Đỏ/Vàng chưa được Kho mô kiểm tra (t.inspection null): chưa ghi nhận được, bỏ qua (khớp Bảng lương).
  }

  const rows: ProductionRecordRow[] = staffList.map((s) => {
    const plantMap = byStaffAndPlant.get(s.id);
    const byPlantType: ProductionRecordPlantTypeBreakdown[] = plantMap
      ? Array.from(plantMap.entries())
          .map(([plantTypeId, quantity]) => ({ plantTypeId, plantTypeCode: plantTypeMetaById.get(plantTypeId)!.code, plantTypeName: plantTypeMetaById.get(plantTypeId)!.name, quantity }))
          .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode))
      : [];
    const totalRecordedQuantity = byPlantType.reduce((sum, p) => sum + p.quantity, 0);

    const staffDayMap = dailyMap.get(s.id);
    let totalUnqualifiedQuantity = 0;
    const dailyDetail: ProductionRecordDailyEntry[] = daysInPeriod.map((d) => {
      const key = dayKey(d);
      const entry = staffDayMap?.get(key);
      totalUnqualifiedQuantity += entry?.unqualified ?? 0;
      return {
        date: key,
        active: entry?.active ?? false,
        recordedQuantity: entry?.quantity ?? 0,
        unqualifiedQuantity: entry?.unqualified ?? 0,
      };
    });

    return {
      staffId: s.id,
      staffCode: s.code,
      staffName: s.name,
      warehouseName: s.workplaceWarehouse?.name ?? null,
      totalRecordedQuantity,
      totalUnqualifiedQuantity,
      byPlantType,
      dailyDetail,
    };
  }).sort((a, b) => b.totalRecordedQuantity - a.totalRecordedQuantity || a.staffName.localeCompare(b.staffName));

  return { rangeStart, rangeEnd: rangeEndExclusive, rows };
}
