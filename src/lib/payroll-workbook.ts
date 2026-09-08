import ExcelJS from "exceljs";
import type { PayrollPeriodResult } from "@/lib/payroll-calculation";
import { EMPLOYMENT_TYPE_LABELS, TRAINEE_LABEL, type EmploymentType } from "@/types";
import { format } from "date-fns";

// Dựng file Excel "Bảng lương" cho NV hành chính nhân sự — sheet 1 tổng hợp theo NV (đúng bộ số bảng
// lương đang hiển thị trên UI), sheet 2 chi tiết ghi nhận từng ngày trong kỳ của từng NV (dùng để đối
// chiếu/giải trình số liệu, xem computePayrollForPeriod).
export function buildPayrollWorkbook(result: PayrollPeriodResult): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const { rows } = result;

  const summarySheet = workbook.addWorksheet("Tổng hợp");
  summarySheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Cơ sở", key: "warehouseName", width: 20 },
    { header: "Loại HĐ", key: "employmentType", width: 16 },
    { header: "Thử việc", key: "isTrainee", width: 10 },
    { header: "Ngày công tiêu chuẩn", key: "standardWorkDays", width: 16 },
    { header: "Ngày công hưởng lương", key: "paidWorkDays", width: 16 },
    { header: "Ngày công tính KPI", key: "kpiWorkDays", width: 16 },
    { header: "Lương tháng cài đặt", key: "baseSalaryMonthly", width: 18 },
    { header: "Lương công việc", key: "workSalary", width: 16 },
    { header: "Điểm vi phạm", key: "violationPoints", width: 12 },
    { header: "Điểm phục hồi", key: "recoveryPoints", width: 12 },
    { header: "Điểm tuân thủ cuối kỳ", key: "compliancePoints", width: 16 },
    { header: "Mức thưởng KPI tối đa", key: "kpiBonusMaxAmount", width: 18 },
    { header: "Thưởng KPI tuân thủ", key: "complianceBonus", width: 16 },
    { header: "Không tính thưởng tuân thủ", key: "complianceKpiDisqualified", width: 18 },
    { header: "KPI/ngày cài đặt", key: "kpiDailyRate", width: 16 },
    { header: "Sản lượng chỉ tiêu", key: "kpiTargetAmount", width: 16 },
    { header: "Sản lượng đủ điều kiện", key: "eligibleProductionAmount", width: 18 },
    { header: "Tỉ lệ nhiễm trong kỳ (%)", key: "contaminationRatePct", width: 16 },
    { header: "Thưởng vượt KPI SL", key: "productionOverBonus", width: 16 },
    { header: "Không tính thưởng vượt SL", key: "productionKpiDisqualified", width: 18 },
    { header: "Khoản khác", key: "otherBonusAmount", width: 14 },
    { header: "Tổng thu nhập", key: "totalIncome", width: 18 },
  ];
  summarySheet.getRow(1).font = { bold: true };

  for (const r of rows) {
    summarySheet.addRow({
      staffCode: r.staffCode,
      staffName: r.staffName,
      warehouseName: r.warehouseName ?? "",
      employmentType: r.employmentType ? EMPLOYMENT_TYPE_LABELS[r.employmentType as EmploymentType] : "",
      isTrainee: r.isTrainee ? TRAINEE_LABEL : "",
      standardWorkDays: r.standardWorkDays,
      paidWorkDays: r.paidWorkDays,
      kpiWorkDays: r.kpiWorkDays,
      baseSalaryMonthly: r.baseSalaryMonthly ?? "",
      workSalary: r.workSalary,
      violationPoints: r.violationPoints,
      recoveryPoints: r.recoveryPoints,
      compliancePoints: r.compliancePoints,
      kpiBonusMaxAmount: r.kpiBonusMaxAmount ?? "",
      complianceBonus: r.complianceBonus,
      complianceKpiDisqualified: r.complianceKpiDisqualified ? "Có" : "",
      kpiDailyRate: r.kpiDailyRate ?? "",
      kpiTargetAmount: r.kpiTargetAmount,
      eligibleProductionAmount: r.eligibleProductionAmount,
      contaminationRatePct: r.contaminationRatePct,
      productionOverBonus: r.productionOverBonus,
      productionKpiDisqualified: r.productionKpiDisqualified ? "Có" : "",
      otherBonusAmount: r.otherBonusAmount,
      totalIncome: r.totalIncome,
    });
  }
  if (rows.length === 0) summarySheet.addRow({ staffCode: "", staffName: "Không có NV nào khớp bộ lọc" });

  const detailSheet = workbook.addWorksheet("Chi tiết theo ngày");
  detailSheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Ngày", key: "date", width: 14 },
    { header: "Chủ nhật", key: "isSunday", width: 10 },
    { header: "Ngày lễ", key: "isHoliday", width: 10 },
    { header: "Có ghi nhận", key: "active", width: 12 },
    { header: "Số lượng ghi nhận", key: "recordedQuantity", width: 16 },
    { header: "Số lượng không đạt", key: "unqualifiedQuantity", width: 16 },
    { header: "Giá trị quy đổi (VNĐ)", key: "recordedAmount", width: 18 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    for (const d of r.dailyDetail) {
      detailSheet.addRow({
        staffCode: r.staffCode,
        staffName: r.staffName,
        date: format(new Date(`${d.date}T00:00:00`), "dd/MM/yyyy"),
        isSunday: d.isSunday ? "CN" : "",
        isHoliday: d.isHoliday ? "Lễ" : "",
        active: d.active ? "Có" : "",
        recordedQuantity: d.recordedQuantity,
        unqualifiedQuantity: d.unqualifiedQuantity,
        recordedAmount: d.recordedAmount,
      });
    }
  }
  if (rows.length === 0) detailSheet.addRow({ staffCode: "", staffName: "Không có NV nào khớp bộ lọc" });

  return workbook;
}
