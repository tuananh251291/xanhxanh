import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePayroll, EMPLOYMENT_TYPE_LABELS, type EmploymentType } from "@/types";
import { buildComplianceKpiReport } from "@/lib/compliance-kpi-report";

// Excel KPI tuân thủ theo kỳ lương: sheet 1 tổng hợp từng NV, sheet 2 chi tiết lỗi vi phạm, sheet 3 điểm phục hồi.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouseId") || undefined;
  const report = await buildComplianceKpiReport(searchParams.get("month"), warehouseId);
  const warehouse = warehouseId ? await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { name: true, code: true } }) : null;

  const periodLabel = `${report.periodMonth.slice(5)}/${report.periodMonth.slice(0, 4)}`;
  const dt = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm");
  const bold = (row: ExcelJS.Row) => { row.font = { bold: true }; };

  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("KPI tuan thu");
  sum.addRow([`KPI TUÂN THỦ NV CẤY MÔ — KỲ LƯƠNG ${periodLabel}`]).font = { bold: true, size: 14 };
  sum.addRow([`Khu sản xuất: ${warehouse ? `${warehouse.name} (${warehouse.code})` : "Tất cả"} · Xuất lúc ${format(new Date(), "dd/MM/yyyy HH:mm")}`]);
  sum.addRow(["Điểm tuân thủ = 100 − điểm vi phạm + điểm phục hồi (tối đa 100). Thưởng = Mức tối đa × Ngày công hưởng lương/Ngày công tiêu chuẩn × Điểm/100; vi phạm nhóm \"Trung thực, gian lận...\" → thưởng = 0."]);
  sum.addRow([]);
  bold(sum.addRow([
    "STT", "Mã NV", "Họ tên", "Khu sản xuất", "Loại HĐ", "Số lỗi vi phạm", "Điểm trừ vi phạm", "Điểm phục hồi",
    "Điểm tuân thủ", "Bị loại thưởng KPI", "Mức thưởng tối đa (VNĐ)", "Ngày công hưởng lương", "Ngày công tiêu chuẩn", "Thưởng KPI tuân thủ (VNĐ)",
  ]));
  report.rows.forEach((r, i) => {
    sum.addRow([
      i + 1, r.staffCode, r.staffName, r.warehouseName ?? "", r.employmentType ? EMPLOYMENT_TYPE_LABELS[r.employmentType as EmploymentType] ?? r.employmentType : "",
      r.violationCount, r.violationPoints, r.recoveryPoints, r.compliancePoints,
      r.complianceKpiDisqualified ? "Có" : "", r.kpiBonusMaxAmount ?? "", r.paidWorkDays, r.standardWorkDays, r.complianceBonus,
    ]);
  });
  const total = sum.addRow(["", "", "Tổng", "", "", report.rows.reduce((s, r) => s + r.violationCount, 0), "", "", "", "", "", "", "", report.rows.reduce((s, r) => s + r.complianceBonus, 0)]);
  bold(total);
  [6, 10, 26, 26, 12, 12, 14, 12, 12, 16, 20, 18, 18, 22].forEach((w, i) => { sum.getColumn(i + 1).width = w; });
  for (const c of [11, 14]) sum.getColumn(c).numFmt = "#,##0";

  const vio = wb.addWorksheet("Chi tiet vi pham");
  bold(vio.addRow(["Mã NV", "Họ tên", "Khu sản xuất", "Thời điểm ghi nhận", "Lỗi vi phạm", "Nhóm lỗi", "Điểm trừ", "Loại thưởng KPI tuân thủ", "Người ghi nhận"]));
  for (const r of report.rows) {
    for (const v of r.violations) {
      vio.addRow([r.staffCode, r.staffName, r.warehouseName ?? "", dt(v.createdAt), v.label, v.groupName ?? "", v.points, v.disqualifiesComplianceKpi ? "Có" : "", v.createdByName]);
    }
  }
  [10, 24, 24, 18, 40, 28, 10, 22, 22].forEach((w, i) => { vio.getColumn(i + 1).width = w; });

  const rec = wb.addWorksheet("Diem phuc hoi");
  bold(rec.addRow(["Mã NV", "Họ tên", "Khu sản xuất", "Thời điểm ghi", "Điểm cộng", "Lý do", "Người ghi"]));
  for (const r of report.rows) {
    for (const x of r.recoveries) rec.addRow([r.staffCode, r.staffName, r.warehouseName ?? "", dt(x.createdAt), x.points, x.reason, x.createdByName]);
  }
  [10, 24, 24, 18, 10, 50, 22].forEach((w, i) => { rec.getColumn(i + 1).width = w; });

  const buffer = await wb.xlsx.writeBuffer();
  const suffix = warehouse ? `-${warehouse.code}` : "";
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="kpi-tuan-thu-${report.periodMonth}${suffix}.xlsx"`,
    },
  });
}
