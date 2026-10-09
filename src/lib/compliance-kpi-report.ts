import { prisma } from "@/lib/prisma";
import { computePayrollForPeriod } from "@/lib/payroll-calculation";

// Báo cáo "KPI tuân thủ" NV cấy mô theo kỳ lương (tab trong Báo cáo vi phạm của HCNS). Điểm/thưởng lấy
// THẲNG từ computePayrollForPeriod để luôn khớp Bảng lương (100 − điểm vi phạm + điểm phục hồi, tối đa
// 100; nhóm "Trung thực, gian lận..." ép thưởng về 0), kèm chi tiết từng lỗi vi phạm / điểm phục hồi
// trong kỳ (cùng phạm vi thời gian payroll dùng: vi phạm theo createdAt trong kỳ, phục hồi theo periodMonth).
export type ComplianceViolationDetail = {
  id: string;
  createdAt: string;
  label: string;
  groupName: string | null;
  points: number;
  disqualifiesComplianceKpi: boolean;
  disqualifiesProductionKpi: boolean;
  createdByName: string;
};

export type ComplianceRecoveryDetail = {
  id: string;
  createdAt: string;
  points: number;
  reason: string;
  createdByName: string;
};

export type ComplianceKpiRow = {
  staffId: string;
  staffCode: string;
  staffName: string;
  warehouseName: string | null;
  employmentType: string | null;
  violationCount: number;
  violationPoints: number;
  recoveryPoints: number;
  compliancePoints: number;
  complianceKpiDisqualified: boolean;
  kpiBonusMaxAmount: number | null;
  paidWorkDays: number;
  standardWorkDays: number;
  complianceBonus: number;
  violations: ComplianceViolationDetail[];
  recoveries: ComplianceRecoveryDetail[];
};

export async function buildComplianceKpiReport(month: string | null, warehouseId?: string) {
  const payroll = await computePayrollForPeriod(month, warehouseId);
  const staffIds = payroll.rows.map((r) => r.staffId);

  const [violations, recoveries] = staffIds.length
    ? await Promise.all([
        prisma.violationRecord.findMany({
          where: { staffId: { in: staffIds }, createdAt: { gte: payroll.rangeStart, lt: payroll.rangeEnd } },
          select: {
            id: true, staffId: true, createdAt: true, pointsApplied: true,
            violationType: { select: { label: true, groupName: true, disqualifiesComplianceKpi: true, disqualifiesProductionKpi: true } },
            createdBy: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        }),
        prisma.complianceRecoveryPoint.findMany({
          where: { staffId: { in: staffIds }, periodMonth: payroll.periodMonth },
          select: { id: true, staffId: true, createdAt: true, points: true, reason: true, createdBy: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        }),
      ])
    : [[], []];

  const rows: ComplianceKpiRow[] = payroll.rows
    .map((r) => {
      const mine = violations.filter((v) => v.staffId === r.staffId);
      return {
        staffId: r.staffId,
        staffCode: r.staffCode,
        staffName: r.staffName,
        warehouseName: r.warehouseName,
        employmentType: r.employmentType,
        violationCount: mine.length,
        violationPoints: r.violationPoints,
        recoveryPoints: r.recoveryPoints,
        compliancePoints: r.compliancePoints,
        complianceKpiDisqualified: r.complianceKpiDisqualified,
        kpiBonusMaxAmount: r.kpiBonusMaxAmount,
        paidWorkDays: r.paidWorkDays,
        standardWorkDays: r.standardWorkDays,
        complianceBonus: r.complianceBonus,
        violations: mine.map((v) => ({
          id: v.id,
          createdAt: v.createdAt.toISOString(),
          label: v.violationType.label,
          groupName: v.violationType.groupName,
          points: v.pointsApplied,
          disqualifiesComplianceKpi: v.violationType.disqualifiesComplianceKpi,
          disqualifiesProductionKpi: v.violationType.disqualifiesProductionKpi,
          createdByName: v.createdBy.name,
        })),
        recoveries: recoveries
          .filter((x) => x.staffId === r.staffId)
          .map((x) => ({ id: x.id, createdAt: x.createdAt.toISOString(), points: x.points, reason: x.reason, createdByName: x.createdBy.name })),
      };
    })
    // Khu → điểm thấp trước (NV cần chú ý lên đầu) → tên.
    .sort((a, b) => (a.warehouseName ?? "").localeCompare(b.warehouseName ?? "") || a.compliancePoints - b.compliancePoints || a.staffName.localeCompare(b.staffName));

  return { periodMonth: payroll.periodMonth, rangeStart: payroll.rangeStart, rangeEnd: payroll.rangeEnd, rows };
}
