import { prisma } from "@/lib/prisma";
import { startOfMonth, endOfMonth, startOfDay, addDays, eachDayOfInterval, parse, isValid, format } from "date-fns";

// Báo cáo "Bàn giao & ghi nhận theo tháng" (Admin + Hành chính nhân sự) — CÙNG khoảng thời gian (tháng
// lịch) và CÙNG công thức "SL bàn giao"/"SL ghi nhận" với computeProductionRecordForPeriod
// (production-record-report.ts, báo cáo "Số lượng ghi nhận" của Admin) để 2 báo cáo luôn khớp số — khác ở
// chỗ báo cáo này CHỈ tính từ Transfer (bàn giao Phòng tối), không cộng thêm DailyRecord vào cờ "active".
//
// "SL bàn giao" = số lượng THỰC SỰ gửi lên kho sáng (đã xếp kệ), KHÔNG PHẢI số NV giao ban đầu ở phòng
// tối — luồng Vàng/Đỏ đã trừ hàng nhiễm Kho mô phát hiện lúc kiểm tra (= TransferInspectionItem
// handedOverQuantity − contaminatedQuantity, tức passedQuantity); luồng Xanh/MM dư không qua kiểm tra
// nhiễm ở bước này nên giữ nguyên số đã giao. Phiếu còn PENDING (chưa kiểm tra, chưa xếp kệ) coi như CHƯA
// bàn giao lên kho sáng — không cộng vào cả SL bàn giao lẫn SL ghi nhận.
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
  contaminatedQuantity: number;
};

export type HandoverSummaryPlantTypeBreakdown = {
  plantTypeId: string;
  plantTypeCode: string;
  plantTypeName: string;
  handedOverQuantity: number;
  recordedQuantity: number;
  contaminatedQuantity: number;
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
  // Số lượng Kho mô phát hiện nhiễm lúc kiểm tra bàn giao (TransferInspectionItem.contaminatedQuantity,
  // luồng Đỏ/Vàng — luồng Xanh không qua kiểm tra nên luôn 0) — hiển thị RIÊNG, giống màn "Kiểm tra bàn
  // giao" của Kho mô (xem inspect-form.tsx cột "SL nhiễm"), thay vì chỉ ẩn trong công thức trừ ra
  // "SL bàn giao". Mẫu số tỉ lệ = totalHandedOverQuantity + totalContaminatedQuantity (số GỐC trước khi
  // trừ nhiễm — totalHandedOverQuantity ở trên đã là số SAU khi trừ).
  totalContaminatedQuantity: number;
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

// dateFrom/dateTo (yyyy-MM-dd) — không truyền (hoặc không hợp lệ) thì mặc định về THÁNG HIỆN TẠI (giữ
// tương thích hành vi cũ, xem cùng quy ước ở computeProductionRecordForPeriod).
export async function computeHandoverSummaryForPeriod(dateFrom?: string | null, dateTo?: string | null, warehouseId?: string): Promise<HandoverSummaryResult> {
  const now = new Date();
  const parsedFrom = dateFrom ? parse(dateFrom, "yyyy-MM-dd", now) : null;
  const parsedTo = dateTo ? parse(dateTo, "yyyy-MM-dd", now) : null;
  let rangeStart = parsedFrom && isValid(parsedFrom) ? startOfDay(parsedFrom) : startOfMonth(now);
  let rangeEndInclusive = parsedTo && isValid(parsedTo) ? startOfDay(parsedTo) : endOfMonth(now);
  if (rangeStart > rangeEndInclusive) [rangeStart, rangeEndInclusive] = [rangeEndInclusive, rangeStart];
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
      inspection: {
        select: {
          items: {
            select: {
              plantTypeId: true, creditedQuantity: true, handedOverQuantity: true, contaminatedQuantity: true,
              plantType: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  });

  const daysInPeriod = eachDayOfInterval({ start: rangeStart, end: rangeEndInclusive });

  type DayAgg = { active: boolean; handedOver: number; recorded: number; unqualified: number; contaminated: number };
  const dailyMap = new Map<string, Map<string, DayAgg>>();
  const ensureDayEntry = (staffId: string, day: string): DayAgg => {
    const staffMap = dailyMap.get(staffId) ?? new Map<string, DayAgg>();
    if (!staffMap.has(day)) staffMap.set(day, { active: false, handedOver: 0, recorded: 0, unqualified: 0, contaminated: 0 });
    dailyMap.set(staffId, staffMap);
    return staffMap.get(day)!;
  };

  const plantTypeMetaById = new Map<string, { code: string; name: string }>();
  type PlantAgg = { handedOver: number; recorded: number; contaminated: number };
  const byStaffAndPlant = new Map<string, Map<string, PlantAgg>>();
  const addPlant = (
    staffId: string, plantTypeId: string, code: string, name: string,
    handedOverDelta: number, recordedDelta: number, contaminatedDelta: number
  ) => {
    plantTypeMetaById.set(plantTypeId, { code, name });
    const m = byStaffAndPlant.get(staffId) ?? new Map<string, PlantAgg>();
    const cur = m.get(plantTypeId) ?? { handedOver: 0, recorded: 0, contaminated: 0 };
    cur.handedOver += handedOverDelta;
    cur.recorded += recordedDelta;
    cur.contaminated += contaminatedDelta;
    m.set(plantTypeId, cur);
    byStaffAndPlant.set(staffId, m);
  };

  const hasPendingByStaff = new Set<string>();

  for (const t of transfers) {
    const dayEntry = ensureDayEntry(t.fromUserId, dayKey(t.createdAt));
    dayEntry.active = true;

    if (t.inspection) {
      for (const insItem of t.inspection.items) {
        const passed = insItem.handedOverQuantity - insItem.contaminatedQuantity;
        addPlant(
          t.fromUserId, insItem.plantTypeId, insItem.plantType.code, insItem.plantType.name,
          passed, insItem.creditedQuantity, insItem.contaminatedQuantity
        );
        dayEntry.handedOver += passed;
        dayEntry.recorded += insItem.creditedQuantity;
        dayEntry.contaminated += insItem.contaminatedQuantity;
      }
    } else if (t.status === "CONFIRMED") {
      // Đã xếp kệ xong mà KHÔNG qua kiểm tra => tại thời điểm bàn giao phiếu này đi theo đường Xanh/MM dư
      // — không qua kiểm tra nhiễm ở bước này nên SL bàn giao giữ nguyên; SL ghi nhận tự khai trừ hàng
      // không đạt (xem giải thích ở đầu file, KHÔNG dùng lane sống). Không có "SL nhiễm" (luồng này không
      // qua Kho mô kiểm tra nhiễm).
      for (const item of t.items) {
        const credited = item.quantity - item.unqualifiedQuantity;
        addPlant(t.fromUserId, item.lot.plantTypeId, item.lot.plantType.code, item.lot.plantType.name, item.quantity, credited, 0);
        dayEntry.handedOver += item.quantity;
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
            contaminatedQuantity: agg.contaminated,
          }))
          .sort((a, b) => a.plantTypeCode.localeCompare(b.plantTypeCode))
      : [];

    const staffDayMap = dailyMap.get(s.id);
    let totalHandedOverQuantity = 0;
    let totalRecordedQuantity = 0;
    let totalUnqualifiedQuantity = 0;
    let totalContaminatedQuantity = 0;
    const dailyDetail: HandoverSummaryDailyEntry[] = daysInPeriod.map((d) => {
      const key = dayKey(d);
      const entry = staffDayMap?.get(key);
      totalHandedOverQuantity += entry?.handedOver ?? 0;
      totalRecordedQuantity += entry?.recorded ?? 0;
      totalUnqualifiedQuantity += entry?.unqualified ?? 0;
      totalContaminatedQuantity += entry?.contaminated ?? 0;
      return {
        date: key,
        active: entry?.active ?? false,
        handedOverQuantity: entry?.handedOver ?? 0,
        recordedQuantity: entry?.recorded ?? 0,
        unqualifiedQuantity: entry?.unqualified ?? 0,
        contaminatedQuantity: entry?.contaminated ?? 0,
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
      totalContaminatedQuantity,
      hasPending: hasPendingByStaff.has(s.id),
      byPlantType,
      dailyDetail,
    };
  }).sort((a, b) => b.totalHandedOverQuantity - a.totalHandedOverQuantity || a.staffName.localeCompare(b.staffName));

  return { rangeStart, rangeEnd: rangeEndExclusive, rows };
}
