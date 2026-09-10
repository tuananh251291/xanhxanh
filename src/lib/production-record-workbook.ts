import ExcelJS from "exceljs";
import type { ProductionRecordResult } from "@/lib/production-record-report";
import { format } from "date-fns";

// Dựng file Excel "Số lượng ghi nhận" của NV cấy mô — sheet 1 tổng hợp theo NV, sheet 2 theo mã cây, sheet
// 3 chi tiết ghi nhận từng ngày trong tháng (dùng để đối chiếu/giải trình số liệu, xem
// computeProductionRecordForPeriod).
export function buildProductionRecordWorkbook(result: ProductionRecordResult): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const { rows } = result;

  const summarySheet = workbook.addWorksheet("Tổng hợp");
  summarySheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Cơ sở", key: "warehouseName", width: 20 },
    { header: "Số lượng bàn giao", key: "totalHandedOverQuantity", width: 16 },
    { header: "Số lượng nhiễm (Kho mô phát hiện)", key: "totalContaminatedQuantity", width: 20 },
    { header: "Tỉ lệ nhiễm (%)", key: "contaminationRatePct", width: 14 },
    { header: "Số lượng ghi nhận", key: "totalRecordedQuantity", width: 16 },
    { header: "Số lượng không đạt", key: "totalUnqualifiedQuantity", width: 16 },
    { header: "Không đạt (Kho mô kiểm tra)", key: "totalInspectedUnqualifiedQuantity", width: 20 },
    { header: "SL nhiễm ngẫu nhiên (Kho mô nhập tay)", key: "totalRandomCheckLossQuantity", width: 22 },
    { header: "Tỉ lệ nhiễm ngẫu nhiên (%)", key: "randomCheckLossRatePct", width: 18 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    const originalHandedOver = r.totalHandedOverQuantity + r.totalContaminatedQuantity;
    const randomCheckBase = r.totalRecordedQuantity + r.totalRandomCheckLossQuantity;
    summarySheet.addRow({
      staffCode: r.staffCode,
      staffName: r.staffName,
      warehouseName: r.warehouseName ?? "",
      totalHandedOverQuantity: r.totalHandedOverQuantity,
      totalContaminatedQuantity: r.totalContaminatedQuantity,
      contaminationRatePct: originalHandedOver > 0 ? Math.round((r.totalContaminatedQuantity / originalHandedOver) * 1000) / 10 : 0,
      totalRecordedQuantity: r.totalRecordedQuantity,
      totalUnqualifiedQuantity: r.totalUnqualifiedQuantity,
      totalInspectedUnqualifiedQuantity: r.totalInspectedUnqualifiedQuantity,
      totalRandomCheckLossQuantity: r.totalRandomCheckLossQuantity,
      randomCheckLossRatePct: randomCheckBase > 0 ? Math.round((r.totalRandomCheckLossQuantity / randomCheckBase) * 1000) / 10 : 0,
    });
  }
  if (rows.length === 0) summarySheet.addRow({ staffCode: "", staffName: "Không có NV nào khớp bộ lọc" });

  const plantSheet = workbook.addWorksheet("Theo mã cây");
  plantSheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Tên cây", key: "plantTypeName", width: 24 },
    { header: "Số lượng bàn giao", key: "handedOverQuantity", width: 16 },
    { header: "Số lượng nhiễm (Kho mô phát hiện)", key: "contaminatedQuantity", width: 20 },
    { header: "Số lượng ghi nhận", key: "quantity", width: 16 },
  ];
  plantSheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    for (const p of r.byPlantType) {
      plantSheet.addRow({
        staffCode: r.staffCode,
        staffName: r.staffName,
        plantTypeCode: p.plantTypeCode,
        plantTypeName: p.plantTypeName,
        handedOverQuantity: p.handedOverQuantity,
        contaminatedQuantity: p.contaminatedQuantity,
        quantity: p.quantity,
      });
    }
  }
  if (rows.length === 0) plantSheet.addRow({ staffCode: "", staffName: "Không có NV nào khớp bộ lọc" });

  const detailSheet = workbook.addWorksheet("Chi tiết theo ngày");
  detailSheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Ngày", key: "date", width: 14 },
    { header: "Có bàn giao", key: "active", width: 12 },
    { header: "Số lượng bàn giao", key: "handedOverQuantity", width: 16 },
    { header: "Số lượng nhiễm (Kho mô phát hiện)", key: "contaminatedQuantity", width: 20 },
    { header: "Số lượng ghi nhận", key: "recordedQuantity", width: 16 },
    { header: "Số lượng không đạt", key: "unqualifiedQuantity", width: 16 },
    { header: "Không đạt (Kho mô kiểm tra)", key: "inspectedUnqualifiedQuantity", width: 20 },
    { header: "SL nhiễm ngẫu nhiên (Kho mô nhập tay)", key: "randomCheckLossQuantity", width: 22 },
  ];
  detailSheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    for (const d of r.dailyDetail) {
      detailSheet.addRow({
        staffCode: r.staffCode,
        staffName: r.staffName,
        date: format(new Date(`${d.date}T00:00:00`), "dd/MM/yyyy"),
        active: d.active ? "Có" : "",
        handedOverQuantity: d.handedOverQuantity,
        contaminatedQuantity: d.contaminatedQuantity,
        recordedQuantity: d.recordedQuantity,
        unqualifiedQuantity: d.unqualifiedQuantity,
        inspectedUnqualifiedQuantity: d.inspectedUnqualifiedQuantity,
        randomCheckLossQuantity: d.randomCheckLossQuantity,
      });
    }
  }
  if (rows.length === 0) detailSheet.addRow({ staffCode: "", staffName: "Không có NV nào khớp bộ lọc" });

  return workbook;
}
