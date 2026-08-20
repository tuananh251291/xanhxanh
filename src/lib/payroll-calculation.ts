import { prisma } from "@/lib/prisma";
import { resolvePayrollPeriod } from "@/lib/payroll-period";
import { eachDayOfInterval, addDays, format } from "date-fns";

export type PayrollBreakdown = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  employmentType: string | null;
  isTrainee: boolean;

  standardWorkDays: number; // Ngày công tiêu chuẩn
  paidWorkDays: number; // Ngày công hưởng lương (= Ngày công được tính thưởng)
  kpiWorkDays: number; // Ngày công được tính KPI

  baseSalaryMonthly: number | null;
  workSalary: number; // Lương công việc

  violationPoints: number;
  recoveryPoints: number;
  compliancePoints: number; // Điểm tuân thủ cuối kỳ (0-100)

  kpiBonusMaxAmount: number | null;
  complianceBonus: number; // Thưởng KPI tuân thủ

  kpiDailyRate: number | null;
  kpiTargetAmount: number; // Sản lượng chỉ tiêu (VNĐ)
  eligibleProductionAmount: number; // Sản lượng đủ điều kiện (VNĐ)
  contaminationRatePct: number; // Tỉ lệ nhiễm trong kỳ
  productionOverBonus: number; // Thưởng vượt KPI sản lượng

  otherBonusAmount: number; // Các khoản khác

  totalIncome: number; // Tổng thu nhập
};

export type PayrollPeriodResult = {
  periodMonth: string;
  rangeStart: Date;
  rangeEnd: Date;
  rows: PayrollBreakdown[];
};

const CONTAMINATION_THRESHOLD_PCT = 5;

function dayKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

// "Bảng lương" tính SỐNG mỗi lần gọi (không chốt sổ/snapshot) — dùng giá trị NGAY LÚC GỌI của mọi bảng
// tham số (StaffBaseSalary, StaffKpiDailyRate, KpiBonusRate, PlantTypeKpiRate...) + vi phạm/điểm phục hồi/
// khoản khác đã ghi trong kỳ. Xem đầy đủ công thức + các giả định đã chốt ở plan
// (robust-skipping-pretzel.md) — mọi con số dưới đây bám sát đúng công thức đó.
export async function computePayrollForPeriod(monthParam?: string | null, warehouseId?: string): Promise<PayrollPeriodResult> {
  const { periodMonth, rangeStart, rangeEnd } = resolvePayrollPeriod(monthParam);

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, ...(warehouseId ? { workplaceWarehouseId: warehouseId } : {}) },
    select: {
      id: true, code: true, name: true, employmentType: true, isTrainee: true, inspectionLane: true,
      workplaceWarehouse: { select: { name: true } },
      staffBaseSalary: { select: { monthlyAmount: true } },
      staffKpiDailyRate: { select: { vndPerDay: true } },
    },
    orderBy: { name: "asc" },
  });
  if (staffList.length === 0) return { periodMonth, rangeStart, rangeEnd, rows: [] };
  const staffIds = staffList.map((s) => s.id);
  const laneByStaff = new Map(staffList.map((s) => [s.id, s.inspectionLane]));

  const [
    dailyRecords, transfers, violationSums, recoverySums, otherBonusSums,
    kpiBonusRate, holidays, instructions, plantRates,
  ] = await Promise.all([
    prisma.dailyRecord.findMany({
      where: { staffId: { in: staffIds }, recordDate: { gte: rangeStart, lt: rangeEnd } },
      select: { staffId: true, recordDate: true },
    }),
    // Cùng nguồn Transfer dùng cho CẢ "ngày làm việc thực tế" (createdAt) LẪN "số lượng ghi nhận" theo
    // mã cây (items/inspection) — tránh truy vấn Transfer 2 lần cho cùng 1 khoảng thời gian.
    prisma.transfer.findMany({
      where: { fromUserId: { in: staffIds }, fromRoom: { type: "PHONG_TOI" }, createdAt: { gte: rangeStart, lt: rangeEnd } },
      select: {
        fromUserId: true,
        createdAt: true,
        items: { select: { quantity: true, unqualifiedQuantity: true, lot: { select: { stageCode: true, plantTypeId: true } } } },
        inspection: { select: { items: { select: { stageCode: true, creditedQuantity: true } } } },
      },
    }),
    prisma.violationRecord.groupBy({
      by: ["staffId"], where: { staffId: { in: staffIds }, createdAt: { gte: rangeStart, lt: rangeEnd } }, _sum: { pointsApplied: true },
    }),
    prisma.complianceRecoveryPoint.groupBy({
      by: ["staffId"], where: { staffId: { in: staffIds }, periodMonth }, _sum: { points: true },
    }),
    prisma.payrollOtherBonus.groupBy({
      by: ["staffId"], where: { staffId: { in: staffIds }, periodMonth }, _sum: { amount: true },
    }),
    prisma.kpiBonusRate.findFirst({ where: { periodMonth: { lte: periodMonth } }, orderBy: { periodMonth: "desc" } }),
    prisma.publicHoliday.findMany({ where: { date: { gte: rangeStart, lt: rangeEnd } } }),
    prisma.plantingInstruction.findMany({
      where: { assignedToId: { in: staffIds }, weekStart: { gte: rangeStart, lt: rangeEnd } },
      select: { assignedToId: true, inputMotherQuantity: true, dailyRecords: { select: { motherContaminatedM05: true } } },
    }),
    prisma.plantTypeKpiRate.findMany({ select: { plantTypeId: true, vndPerUnit: true } }),
  ]);

  // Ngày công tiêu chuẩn/số ngày nghỉ lễ hưởng lương — GIỐNG NHAU cho mọi NV trong cùng kỳ, tính 1 lần.
  const daysInPeriod = eachDayOfInterval({ start: rangeStart, end: addDays(rangeEnd, -1) });
  const sundayCount = daysInPeriod.filter((d) => d.getDay() === 0).length;
  const holidayDayKeys = new Set(holidays.map((h) => dayKey(h.date)));
  const standardWorkDays = daysInPeriod.length - sundayCount - holidayDayKeys.size;
  const kpiWorkDays = standardWorkDays - 1;
  const paidHolidayCount = holidays.filter((h) => h.isPaid).length;

  // Ngày làm việc thực tế = ngày có nhật ký cấy HOẶC bàn giao phòng tối (hệ thống không có chấm công).
  const activeDaysByStaff = new Map<string, Set<string>>();
  const addActiveDay = (staffId: string, d: Date) => {
    const set = activeDaysByStaff.get(staffId) ?? new Set<string>();
    set.add(dayKey(d));
    activeDaysByStaff.set(staffId, set);
  };
  for (const r of dailyRecords) addActiveDay(r.staffId, r.recordDate);
  for (const t of transfers) addActiveDay(t.fromUserId, t.createdAt);

  // "Sản lượng đủ điều kiện" theo mã cây — luồng Xanh tính trực tiếp từng dòng (đã tách sẵn theo lô/mã
  // cây); luồng Đỏ chỉ có creditedQuantity gộp theo stageCode (không tách theo mã cây trong dữ liệu gốc)
  // nên phân bổ TỈ LỆ THUẬN theo tỉ trọng số lượng bàn giao của từng mã cây trong CÙNG stageCode/CÙNG
  // phiếu — làm tròn từng phần, có thể lệch vài đơn vị so với creditedQuantity gốc khi cộng lại (chấp
  // nhận được, ảnh hưởng không đáng kể tới số tiền).
  const recordedByStaffAndPlant = new Map<string, Map<string, number>>();
  const addRecorded = (staffId: string, plantTypeId: string, qty: number) => {
    const m = recordedByStaffAndPlant.get(staffId) ?? new Map<string, number>();
    m.set(plantTypeId, (m.get(plantTypeId) ?? 0) + qty);
    recordedByStaffAndPlant.set(staffId, m);
  };
  for (const t of transfers) {
    const isXanh = laneByStaff.get(t.fromUserId) === "XANH";
    if (isXanh) {
      for (const item of t.items) {
        addRecorded(t.fromUserId, item.lot.plantTypeId, item.quantity - item.unqualifiedQuantity);
      }
    } else if (t.inspection) {
      const byStage = new Map<string, Map<string, number>>();
      for (const item of t.items) {
        const m = byStage.get(item.lot.stageCode) ?? new Map<string, number>();
        m.set(item.lot.plantTypeId, (m.get(item.lot.plantTypeId) ?? 0) + item.quantity);
        byStage.set(item.lot.stageCode, m);
      }
      for (const insItem of t.inspection.items) {
        const stageMap = byStage.get(insItem.stageCode);
        if (!stageMap) continue;
        const totalHanded = [...stageMap.values()].reduce((s, v) => s + v, 0);
        if (totalHanded <= 0) continue;
        for (const [plantTypeId, handed] of stageMap) {
          addRecorded(t.fromUserId, plantTypeId, Math.round((insItem.creditedQuantity * handed) / totalHanded));
        }
      }
    }
    // Luồng Đỏ chưa kiểm tra (t.inspection null): chưa ghi nhận được, bỏ qua (khớp handover-summary).
  }

  const plantRateMap = new Map(plantRates.map((r) => [r.plantTypeId, r.vndPerUnit]));

  // Tỉ lệ nhiễm trong kỳ — CÙNG công thức đã sửa ở /api/reports/mother-contamination: tổng
  // motherContaminatedM05 / tổng inputMotherQuantity của các chỉ định có weekStart trong kỳ, theo từng NV.
  const contaminationByStaff = new Map<string, { contaminated: number; input: number }>();
  for (const inst of instructions) {
    if (!inst.assignedToId) continue;
    const entry = contaminationByStaff.get(inst.assignedToId) ?? { contaminated: 0, input: 0 };
    entry.contaminated += inst.dailyRecords.reduce((s, r) => s + r.motherContaminatedM05, 0);
    entry.input += inst.inputMotherQuantity;
    contaminationByStaff.set(inst.assignedToId, entry);
  }

  const violationByStaff = new Map(violationSums.map((v) => [v.staffId, v._sum.pointsApplied ?? 0]));
  const recoveryByStaff = new Map(recoverySums.map((v) => [v.staffId, v._sum.points ?? 0]));
  const otherBonusByStaff = new Map(otherBonusSums.map((v) => [v.staffId, v._sum.amount ?? 0]));

  const rows: PayrollBreakdown[] = staffList.map((s) => {
    const activeDays = activeDaysByStaff.get(s.id)?.size ?? 0;
    const paidWorkDays = activeDays + paidHolidayCount;

    const baseSalaryMonthly = s.staffBaseSalary?.monthlyAmount ?? null;
    const workSalary = baseSalaryMonthly != null && standardWorkDays > 0
      ? Math.round((baseSalaryMonthly * paidWorkDays) / standardWorkDays)
      : 0;

    const violationPoints = violationByStaff.get(s.id) ?? 0;
    const recoveryPoints = recoveryByStaff.get(s.id) ?? 0;
    const compliancePoints = Math.min(100, Math.max(0, 100 - violationPoints + recoveryPoints));

    const kpiBonusMaxAmount = kpiBonusRate?.maxAmount ?? null;
    const complianceBonus = kpiBonusMaxAmount != null && standardWorkDays > 0
      ? Math.round(kpiBonusMaxAmount * (paidWorkDays / standardWorkDays) * (compliancePoints / 100))
      : 0;

    const kpiDailyRate = s.staffKpiDailyRate?.vndPerDay ?? null;
    const kpiTargetAmount = kpiDailyRate != null ? kpiDailyRate * kpiWorkDays : 0;

    const recordedMap = recordedByStaffAndPlant.get(s.id);
    const eligibleProductionAmount = recordedMap
      ? [...recordedMap.entries()].reduce((sum, [plantTypeId, qty]) => sum + qty * (plantRateMap.get(plantTypeId) ?? 0), 0)
      : 0;

    const contam = contaminationByStaff.get(s.id);
    const contaminationRatePct = contam && contam.input > 0 ? (contam.contaminated / contam.input) * 100 : 0;

    const productionOverBonus =
      eligibleProductionAmount > kpiTargetAmount && contaminationRatePct <= CONTAMINATION_THRESHOLD_PCT && !s.isTrainee
        ? Math.round((eligibleProductionAmount - kpiTargetAmount) * (compliancePoints / 100))
        : 0;

    const otherBonusAmount = otherBonusByStaff.get(s.id) ?? 0;

    const totalIncome = workSalary + complianceBonus + productionOverBonus + otherBonusAmount;

    return {
      staffId: s.id,
      staffCode: s.code,
      staffName: s.name,
      warehouseName: s.workplaceWarehouse?.name ?? null,
      employmentType: s.employmentType,
      isTrainee: s.isTrainee,
      standardWorkDays,
      paidWorkDays,
      kpiWorkDays,
      baseSalaryMonthly,
      workSalary,
      violationPoints,
      recoveryPoints,
      compliancePoints,
      kpiBonusMaxAmount,
      complianceBonus,
      kpiDailyRate,
      kpiTargetAmount,
      eligibleProductionAmount,
      contaminationRatePct: Math.round(contaminationRatePct * 10) / 10,
      productionOverBonus,
      otherBonusAmount,
      totalIncome,
    };
  });

  return { periodMonth, rangeStart, rangeEnd, rows };
}
