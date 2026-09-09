import ExcelJS from "exceljs";
import type { InspectionDefectReportResult } from "@/lib/inspection-defect-report";
import { format } from "date-fns";

// Dựng file Excel "Phiếu kiểm tra hàng không đạt/nhiễm" — sheet 1 tổng hợp theo NV, sheet 2 chi tiết từng
// dòng (mã cây) trong từng phiếu kiểm tra bị trừ, xem computeInspectionDefectReport.
export function buildInspectionDefectWorkbook(result: InspectionDefectReportResult): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const { staffSummary, tickets } = result;

  const summarySheet = workbook.addWorksheet("Tổng hợp theo NV");
  summarySheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Số phiếu bị trừ", key: "ticketCount", width: 16 },
    { header: "Tổng SL không đạt", key: "totalUnqualifiedQuantity", width: 16 },
    { header: "Tổng SL nhiễm", key: "totalContaminatedQuantity", width: 16 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const s of staffSummary) {
    summarySheet.addRow({
      staffCode: s.staffCode,
      staffName: s.staffName,
      ticketCount: s.ticketCount,
      totalUnqualifiedQuantity: s.totalUnqualifiedQuantity,
      totalContaminatedQuantity: s.totalContaminatedQuantity,
    });
  }
  if (staffSummary.length === 0) summarySheet.addRow({ staffCode: "", staffName: "Không có phiếu nào khớp bộ lọc" });

  const detailSheet = workbook.addWorksheet("Chi tiết phiếu kiểm tra");
  detailSheet.columns = [
    { header: "Mã phiếu bàn giao", key: "transferCode", width: 18 },
    { header: "Ngày bàn giao", key: "transferDate", width: 14 },
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Người kiểm tra", key: "inspectedByName", width: 20 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Tên cây", key: "plantTypeName", width: 22 },
    { header: "Quy cách", key: "stageCode", width: 10 },
    { header: "SL bàn giao", key: "handedOverQuantity", width: 14 },
    { header: "SL không đạt", key: "unqualifiedQuantity", width: 14 },
    { header: "SL nhiễm", key: "contaminatedQuantity", width: 14 },
    { header: "SL đạt", key: "passedQuantity", width: 12 },
    { header: "SL ghi nhận (KPI)", key: "creditedQuantity", width: 16 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const t of tickets) {
    detailSheet.addRow({
      transferCode: t.transferCode,
      transferDate: format(t.transferDate, "dd/MM/yyyy"),
      staffCode: t.staffCode,
      staffName: t.staffName,
      inspectedByName: t.inspectedByName,
      plantTypeCode: t.plantTypeCode,
      plantTypeName: t.plantTypeName,
      stageCode: t.stageCode,
      handedOverQuantity: t.handedOverQuantity,
      unqualifiedQuantity: t.unqualifiedQuantity,
      contaminatedQuantity: t.contaminatedQuantity,
      passedQuantity: t.passedQuantity,
      creditedQuantity: t.creditedQuantity,
    });
  }
  if (tickets.length === 0) detailSheet.addRow({ transferCode: "", staffName: "Không có phiếu nào khớp bộ lọc" });

  return workbook;
}
