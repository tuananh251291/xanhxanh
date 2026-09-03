import ExcelJS from "exceljs";
import type { MonthColumn, StockByFacilityRow } from "@/lib/monthly-stock-export";

// Dựng file Excel 2 sheet dùng chung cho 2 báo cáo "Tồn kho cuối kỳ hàng tháng, phân loại theo cơ sở"
// (mẫu mẹ + thành phẩm, xem monthly-stock-export.ts) — sheet 1 tổng theo cơ sở (cộng mọi mã cây), sheet 2
// chi tiết từng cơ sở + mã cây, cùng bộ cột tháng.
export function buildMonthlyStockWorkbook(sheetLabel: string, months: MonthColumn[], rows: StockByFacilityRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const monthHeaders = months.map((m) => ({ header: m.label, key: m.label, width: 16 }));

  const byWarehouse = new Map<string, { code: string; name: string; totals: number[] }>();
  for (const row of rows) {
    const entry = byWarehouse.get(row.warehouseCode) ?? { code: row.warehouseCode, name: row.warehouseName, totals: months.map(() => 0) };
    row.byMonth.forEach((v, i) => { entry.totals[i] += v; });
    byWarehouse.set(row.warehouseCode, entry);
  }

  const summarySheet = workbook.addWorksheet("Theo cơ sở");
  summarySheet.columns = [
    { header: "Mã cơ sở", key: "code", width: 14 },
    { header: "Tên cơ sở", key: "name", width: 26 },
    ...monthHeaders,
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const wh of byWarehouse.values()) {
    const record: Record<string, string | number> = { code: wh.code, name: wh.name };
    months.forEach((m, i) => { record[m.label] = wh.totals[i]; });
    summarySheet.addRow(record);
  }

  const detailSheet = workbook.addWorksheet("Chi tiết theo mã cây");
  detailSheet.columns = [
    { header: "Mã cơ sở", key: "warehouseCode", width: 14 },
    { header: "Tên cơ sở", key: "warehouseName", width: 26 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Tên cây", key: "plantTypeName", width: 24 },
    ...monthHeaders,
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    const record: Record<string, string | number> = {
      warehouseCode: row.warehouseCode,
      warehouseName: row.warehouseName,
      plantTypeCode: row.plantTypeCode,
      plantTypeName: row.plantTypeName,
    };
    months.forEach((m, i) => { record[m.label] = row.byMonth[i]; });
    detailSheet.addRow(record);
  }

  if (rows.length === 0) {
    summarySheet.addRow({ code: "", name: `Chưa có dữ liệu ${sheetLabel}` });
  }

  return workbook;
}
