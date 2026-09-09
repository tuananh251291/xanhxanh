import ExcelJS from "exceljs";
import type { HandoverSummaryResult } from "@/lib/handover-summary-report";
import { format } from "date-fns";

// Dựng file Excel "Bàn giao & ghi nhận theo tháng" — cùng cấu trúc 3 sheet với
// buildProductionRecordWorkbook (production-record-workbook.ts, báo cáo "Số lượng ghi nhận" của Admin),
// thêm cột "Số lượng bàn giao" ở mỗi sheet vì đây là điểm khác biệt riêng của báo cáo này.
export function buildHandoverSummaryWorkbook(result: HandoverSummaryResult): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const { rows } = result;

  const summarySheet = workbook.addWorksheet("Tổng hợp");
  summarySheet.columns = [
    { header: "Mã NV", key: "staffCode", width: 12 },
    { header: "Tên NV", key: "staffName", width: 24 },
    { header: "Cơ sở", key: "warehouseName", width: 20 },
    { header: "Luồng", key: "lane", width: 10 },
    { header: "Số lượng bàn giao", key: "totalHandedOverQuantity", width: 16 },
    { header: "Số lượng ghi nhận", key: "totalRecordedQuantity", width: 16 },
    { header: "Số lượng không đạt", key: "totalUnqualifiedQuantity", width: 16 },
    { header: "Còn phiếu chờ kiểm tra", key: "hasPending", width: 18 },
  ];
  summarySheet.getRow(1).font = { bold: true };
  for (const r of rows) {
    summarySheet.addRow({
      staffCode: r.staffCode,
      staffName: r.staffName,
      warehouseName: r.warehouseName ?? "",
      lane: r.lane === "XANH" ? "Xanh" : r.lane === "VANG" ? "Vàng" : r.lane === "DO" ? "Đỏ" : "",
      totalHandedOverQuantity: r.totalHandedOverQuantity,
      totalRecordedQuantity: r.totalRecordedQuantity,
      totalUnqualifiedQuantity: r.totalUnqualifiedQuantity,
      hasPending: r.hasPending ? "Có" : "",
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
    { header: "Số lượng ghi nhận", key: "recordedQuantity", width: 16 },
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
        recordedQuantity: p.recordedQuantity,
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
    { header: "Số lượng ghi nhận", key: "recordedQuantity", width: 16 },
    { header: "Số lượng không đạt", key: "unqualifiedQuantity", width: 16 },
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
        recordedQuantity: d.recordedQuantity,
        unqualifiedQuantity: d.unqualifiedQuantity,
      });
    }
  }
  if (rows.length === 0) detailSheet.addRow({ staffCode: "", staffName: "Không có NV nào khớp bộ lọc" });

  return workbook;
}
