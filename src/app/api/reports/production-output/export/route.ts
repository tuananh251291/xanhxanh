import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePayroll } from "@/types";
import { buildProductionOutputReport } from "@/lib/production-output-report";

// Xuất Excel "Sản lượng ghi nhận" ĐÚNG theo bộ lọc đang chọn (kỳ, khu, ô tìm kiếm).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const warehouseId = sp.get("warehouseId") || undefined;
  const q = sp.get("q");
  const report = await buildProductionOutputReport({ month: sp.get("month"), warehouseId, q });
  const warehouse = warehouseId ? await prisma.warehouse.findUnique({ where: { id: warehouseId }, select: { name: true, code: true } }) : null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("San luong ghi nhan");
  const period = `${report.periodMonth.slice(5)}/${report.periodMonth.slice(0, 4)}`;
  ws.addRow([`SẢN LƯỢNG GHI NHẬN NV CẤY MÔ — KỲ LƯƠNG ${period}`]).font = { bold: true, size: 14 };
  ws.addRow([
    `Cơ sở: ${warehouse ? `${warehouse.name} (${warehouse.code})` : "Tất cả"}${q?.trim() ? ` · Tìm: "${q.trim()}"` : ""} · Xuất lúc ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
  ]);
  ws.addRow([]);
  const header = ws.addRow(["Mã NV", "Tên NV", "Cơ sở", "Mã cây", "Quy cách", "Số lượng bàn giao", "Số lượng ghi nhận", "Số lượng nhiễm", "Tỷ lệ nhiễm", "Đơn giá", "Thành tiền"]);
  header.font = { bold: true };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2E6" } }; });

  for (const r of report.rows) {
    ws.addRow([
      r.staffCode, r.staffName, r.warehouseName ?? "", r.plantTypeCode, r.stageCode,
      r.handedOverQuantity, r.recordedQuantity, r.contaminatedQuantity, r.contaminationRatePct / 100,
      r.unitPrice ?? "Chưa cài", r.amount,
    ]);
  }
  const t = report.totals;
  const base = t.handedOverQuantity + t.contaminatedQuantity;
  const total = ws.addRow(["", "TỔNG", "", "", "", t.handedOverQuantity, t.recordedQuantity, t.contaminatedQuantity, base > 0 ? t.contaminatedQuantity / base : 0, "", t.amount]);
  total.font = { bold: true };

  [10, 26, 26, 10, 10, 18, 18, 16, 12, 12, 16].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  for (const c of [6, 7, 8, 10, 11]) ws.getColumn(c).numFmt = "#,##0";
  ws.getColumn(9).numFmt = "0.00%";
  ws.views = [{ state: "frozen", ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 11 } };

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="san-luong-ghi-nhan-${report.periodMonth}${warehouse ? `-${warehouse.code}` : ""}.xlsx"`,
    },
  });
}
