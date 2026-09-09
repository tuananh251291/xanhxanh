import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, addDays, eachDayOfInterval, parse, isValid, format } from "date-fns";

// Báo cáo "Bàn giao & ghi nhận theo tháng" (Admin + Hành chính nhân sự) — CÙNG khoảng thời gian (tháng
// lịch) và CÙNG công thức "ghi nhận" với computeProductionRecordForPeriod (production-record-report.ts,
// báo cáo "Số lượng ghi nhận" của Admin) để 2 báo cáo luôn khớp số — khác ở chỗ báo cáo này CHỈ tính từ
// Transfer (bàn giao Phòng tối), không cộng thêm DailyRecord vào cờ "active", và có thêm số lượng ĐÃ BÀN
// GIAO (trước khi trừ không đạt/kiểm tra) bên cạnh số ĐÃ GHI NHẬN.
//
// QUAN TRỌNG: phân biệt "tự ghi nhận (Xanh)" hay "cần kiểm tra (Đỏ/Vàng)" theo TỪNG PHIẾU dựa trên
// t.status/t.inspection — KHÔNG dùng User.inspectionLane (giá trị SỐNG, bị ghi đè đầu mỗi tháng). Field
// `lane` trong row CHỈ để hiển thị luồng HIỆN TẠI của NV, không dùng để tính toán — xem giải thích đầy đủ
// ở production-record-report.ts (cùng bug đã sửa, phát hiện 09/09/2026).
export type HandoverSummaryDailyEntry = {
  date: string; // yyyy-MM-dd
  active: boolean;
  handedOverQuantity: number;
  recordedQuantity: number;
  unqualifiedQuantity: number;
};

export type HandoverSummaryPlantTypeBreakdown = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  handedOverQuantity: number;
  recordedQuantity: number;
};

export type HandoverSummaryRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  lane: "XANH" | "VANG" | "DO" | null;
  totalHandedOverQuantity: number;
  totalRecordedQuantity: number;
  totalUnqualifiedQuantity: number;
  hasPending: boolean;
  byPlantType: HandoverSummaryPlantTypeBreakdown[];
  dailyDetail: HandoverSummaryDailyEntry[];
};

export type HandoverSummaryResult = {
  rangeStart: Date;
  rangeEnd: Date; // bao gồm hết ngày cuối tháng
  rows: HandoverSummaryRow[];
};

function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export async function computeHandoverSummaryForPeriod(monthParam?: string | null, warehouseId?: string): Promise<HandoverSummaryResult> {
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

  const transfers = await prisma.transfer.findMany({
    // status != REJECTED — phiếu bị Kho mô từ chối (VD MM dư không hợp lệ) coi như CHƯA TỪNG bàn giao
    // thật, không tính vào bàn giao/ghi nhận lẫn "còn chờ kiểm tra" (đã có kết luận, không còn chờ gì).
    where: { fromUserId: { in: staffIds }, fromRoom: { type: "PHONG_TOI" }, createdAt: { gte: rangeStart, lt: rangeEndExclusive }, status: { not: "REJECTED" } },
    select: {
      fromUserId: true,
      createdAt: true,
      status: true,
      items: { select: { quantity: true, unqualifiedQuantity: true, lot: { select: { plantTypeId: true, plantType: { select: { code: true, name: true } } } } } },
      inspection: { select: { items: { select: { plantTypeId: true, creditedQuantity: true, plantType: { select: { code: true, name: true } } } } } },
    },
  });

  const daysInPeriod = eachDayOfInterval({ start: rangeStart, end: rangeEndInclusive });

  type DayAgg = { active: boolean; handedOver: number; recorded: number; unqualified: number };
  const dailyMap = new Map<string, Map<string, DayAgg>>();
  const ensureDayEntry = (staffId: string, day: string): DayAgg => {
    const staffMap = dailyMap.get(staffId) ?? new Map<string, DayAgg>();
    if (!staffMap.has(day)) staffMap.set(day, { active: false, handedOver: 0, recorded: 0, unqualified: 0 });
    dailyMap.set(staffId, staffMap);
    return staffMap.get(day)!;
  };

  const plantTypeMetaById = new Map<string, { code: string; name: string }>();
  type PlantAgg = { handedOver: number; recorded: number };
  const byStaffAndPlant = new Map<string, Map<string, PlantAgg>>();
  const addPlant = (staffId: string, plantTypeId: string, code: string, name: string, handedOverDelta: number, recordedDelta: number) => {
    plantTypeMetaById.set(plantTypeId, { code, name });
    const m = byStaffAndPlant.get(staffId) ?? new Map<string, PlantAgg>();
    const cur = m.get(plantTypeId) ?? { handedOver: 0, recorded: 0 };
    cur.handedOver += handedOverDelta;
    cur.recorded += recordedDelta;
    m.set(plantTypeId, cur);
    byStaffAndPlant.set(staffId, m);
  };

  const hasPendingByStaff = new Set<string>();

  for (const t of transfers) {
    const dayEntry = ensureDayEntry(t.fromUserId, dayKey(t.createdAt));
    dayEntry.active = true;

    for (const item of t.items) {
      dayEntry.handedOver += item.quantity;
      addPlant(t.fromUserId, item.lot.plantTypeId, item.lot.plantType.code, item.lot.plantType.name, item.quantity, 0);
    }

    if (t.inspection) {
      for (const insItem of t.inspection.items) {
        addPlant(t.fromUserId, insItem.plantTypeId, insItem.plantType.code, insItem.plantType.name, 0, insItem.creditedQuantity);
        dayEntry.recorded += insItem.creditedQuantity;
      }
    } else if (t.status === "CONFIRMED") {
      // Đã xếp kệ xong mà KHÔNG qua kiểm tra => tại thời điểm bàn giao phiếu này đi theo đường Xanh/MM dư
      // — tự ghi nhận theo số NV tự khai (xem giải thích ở đầu file, KHÔNG dùng lane sống).
      for (const item of t.items) {
        const credited = item.quantity - item.unqualifiedQuantity;
        addPlant(t.fromUserId, item.lot.plantTypeId, item.lot.plantType.code, item.lot.plantType.name, 0, credited);
        dayEntry.recorded += credited;
        dayEntry.unqualified += item.unqualifiedQuantity;
      }
    } else {
      hasPendingByStaff.add(t.fromUserId);
    }
  }

  const rows: HandoverSummaryRow[] = staffList.map((s) => {
    const plantMap = byStaffAndPlant.get(s.id);
    const byPlantType: HandoverSummaryPlantTypeBreakdown[] = plantMap
      ? Array.from(plantMap.entries())
          .map(([plantTypeId, agg]) => ({
            plantTypeId,
            plantTypeCode: plantTypeMetaById.get(plantTypeId)!.code,
            plantTypeName: plantTypeMetaById.get(plantTypeId)!.name,
            handedOverQuantity: agg.handedOver,
            recordedQuantity: agg.recorded,
          }))
          .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode))
      : [];

    const staffDayMap = dailyMap.get(s.id);
    let totalHandedOverQuantity = 0;
    let totalRecordedQuantity = 0;
    let totalUnqualifiedQuantity = 0;
    const dailyDetail: HandoverSummaryDailyEntry[] = daysInPeriod.map((d) => {
      const key = dayKey(d);
      const entry = staffDayMap?.get(key);
      totalHandedOverQuantity += entry?.handedOver ?? 0;
      totalRecordedQuantity += entry?.recorded ?? 0;
      totalUnqualifiedQuantity += entry?.unqualified ?? 0;
      return {
        date: key,
        active: entry?.active ?? false,
        handedOverQuantity: entry?.handedOver ?? 0,
        recordedQuantity: entry?.recorded ?? 0,
        unqualifiedQuantity: entry?.unqualified ?? 0,
      };
    });

    return {
      staffId: s.id,
      staffCode: s.code,
      staffName: s.name,
      warehouseName: s.workplaceWarehouse?.name ?? null,
      lane: s.inspectionLane,
      totalHandedOverQuantity,
      totalRecordedQuantity,
      totalUnqualifiedQuantity,
      hasPending: hasPendingByStaff.has(s.id),
      byPlantType,
      dailyDetail,
    };
  }).sort((a, b) => b.totalHandedOverQuantity - a.totalHandedOverQuantity || a.staffName.localeCompare(b.staffName));

  return { rangeStart, rangeEnd: rangeEndExclusive, rows };
}
