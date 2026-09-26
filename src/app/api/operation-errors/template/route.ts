import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { isAdminRole } from "@/types";
import { markRequiredHeaders, styleExampleRow, addGuideSheet } from "@/lib/excel-import";

export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "SALE" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Đơn vận hành lỗi");
  sheet.columns = [
    { header: "Ngày xảy ra", key: "occurredAt", width: 14 },
    { header: "Lỗi vận hành", key: "description", width: 40 },
    { header: "Chi phí phát sinh", key: "costAmount", width: 18 },
    { header: "Xanh Xanh chịu chi phí", key: "xanhxanhCost", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3]);
  sheet.addRow({
    occurredAt: "01/09/2026",
    description: "Gửi nhầm cây, gửi sai cây",
    costAmount: 500000,
    xanhxanhCost: 200000,
  });
  styleExampleRow(sheet.getRow(2));

  addGuideSheet(workbook, [
    { column: "Ngày xảy ra", required: true, description: "Ngày thực tế xảy ra lỗi vận hành, định dạng dd/mm/yyyy." },
    { column: "Lỗi vận hành", required: true, description: "Mô tả trường hợp lỗi — VD: Gửi nhầm cây, gửi sai cây." },
    { column: "Chi phí phát sinh", required: true, description: "Tổng chi phí phát sinh do lỗi này, đơn vị VNĐ — số nguyên không âm." },
    {
      column: "Xanh Xanh chịu chi phí",
      required: false,
      description: "Phần Xanh Xanh chịu, đơn vị VNĐ — để trống = 0 (Đối tác chịu toàn bộ). Không được vượt quá Chi phí phát sinh. Đối tác chịu chi phí hệ thống tự tính = Chi phí phát sinh − Xanh Xanh chịu chi phí.",
    },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-don-van-hanh-loi.xlsx"`,
    },
  });
}
