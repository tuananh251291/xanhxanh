import ExcelJS from "exceljs";
import { format } from "date-fns";
import type { MotherForecastWarehouseOverview } from "@/lib/mother-forecast";

// Dựng file Excel "Dự kiến đáp ứng mẫu mẹ" — sheet 1 tổng hợp trạng thái nộp theo cơ sở, sheet 2 chi tiết
// từng dòng (mã cây/NV cấy mô/số lượng 3 tháng) của mọi cơ sở, xem getMotherForecastOverview.
export function buildMotherForecastWorkbook(
  warehouses: MotherForecastWarehouseOverview[],
  targetMonths: [Date, Date, Date]
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const monthLabels = targetMonths.map((m) => format(m, "MM/yyyy"));

  const summarySheet = workbook.addWorksheet("Tổng hợp theo cơ sở");
  summarySheet.columns = [
    { header: "Mã cơ sở", key: "warehouseCode", width: 12 },
    { header: "Tên cơ sở", key: "warehouseName", width: 26 },
    { header: "Trạng thái", key: "status", width: 18 },
    { header: "Người nộp", key: "submittedByName", width: 22 },
    { header: "Thời gian nộp", key: "submittedAt", width: 18 },
    { header: "Đúng/trễ hạn", key: "onTime", width: 14 },
    { header: "Số dòng đã nộp", key: "entryCount", width: 16 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const w of warehouses) {
    summarySheet.addRow({
      warehouseCode: w.warehouseCode,
      warehouseName: w.warehouseName,
      status: w.isLocked ? "Đã nộp" : "Chưa nộp",
      submittedByName: w.submittedByName ? `${w.submittedByCode} — ${w.submittedByName}` : "",
      submittedAt: w.submittedAt ? format(w.submittedAt, "dd/MM/yyyy HH:mm") : "",
      onTime: w.isOnTime === null ? "" : w.isOnTime ? "Đúng hạn" : "Trễ hạn",
      entryCount: w.entries.length,
    });
  }

  const detailSheet = workbook.addWorksheet("Chi tiết");
  detailSheet.columns = [
    { header: "Mã cơ sở", key: "warehouseCode", width: 12 },
    { header: "Tên cơ sở", key: "warehouseName", width: 26 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Tên cây", key: "plantTypeName", width: 22 },
    { header: "Mã NV cấy mô", key: "staffCode", width: 14 },
    { header: "Tên NV cấy mô", key: "staffName", width: 22 },
    { header: `SL dự kiến — Th.${monthLabels[0]}`, key: "quantity1", width: 18 },
    { header: `SL dự kiến — Th.${monthLabels[1]}`, key: "quantity2", width: 18 },
    { header: `SL dự kiến — Th.${monthLabels[2]}`, key: "quantity3", width: 18 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const w of warehouses) {
    for (const e of w.entries) {
      detailSheet.addRow({
        warehouseCode: w.warehouseCode,
        warehouseName: w.warehouseName,
        plantTypeCode: e.plantTypeCode,
        plantTypeName: e.plantTypeName,
        staffCode: e.staffCode,
        staffName: e.staffName,
        quantity1: e.quantity1,
        quantity2: e.quantity2,
        quantity3: e.quantity3,
      });
    }
  }
  if (warehouses.every((w) => w.entries.length === 0)) {
    detailSheet.addRow({ warehouseCode: "", warehouseName: "Chưa có cơ sở nào nộp dữ liệu" });
  }

  return workbook;
}
