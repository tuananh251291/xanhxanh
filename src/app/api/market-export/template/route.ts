import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { isAdminRole } from "@/types";
import { markRequiredHeaders, styleExampleRow, addGuideSheet } from "@/lib/excel-import";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "DOI_TAC_VAN_HANH" && !isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Bạn không có quyền dùng chức năng này" }, { status: 403 });
  }

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Xuất cây");
  sheet.columns = [
    { header: "Mã đơn", key: "orderCode", width: 16 },
    { header: "Tình trạng", key: "status", width: 16 },
    { header: "Ngày", key: "orderedAt", width: 14 },
    { header: "Lineitem quantity", key: "quantity", width: 16 },
    { header: "Tên SPF", key: "spfName", width: 24 },
    { header: "Mã hàng", key: "productCode", width: 18 },
    { header: "Tên nội bộ", key: "internalName", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 3, 4, 6, 7]);
  sheet.addRow({
    orderCode: "SO-1023",
    status: "fulfilled",
    orderedAt: "01/09/2026",
    quantity: 2,
    spfName: "Cây Trầu Bà Thanh Xuân",
    productCode: `${plantTypes[0]?.code ?? "MT001"}-T05`,
    internalName: plantTypes[0]?.name ?? "Trầu bà thanh xuân",
  });
  styleExampleRow(sheet.getRow(2));

  const lookupSheet = workbook.addWorksheet("Danh mục");
  lookupSheet.columns = [
    { header: "Tên nội bộ (khớp cột Tên nội bộ)", key: "name", width: 32 },
    { header: "Mã cây", key: "code", width: 14 },
  ];
  lookupSheet.getRow(1).font = { bold: true };
  for (const p of plantTypes) lookupSheet.addRow({ name: p.name, code: p.code });

  addGuideSheet(workbook, [
    { column: "Mã đơn", required: true, description: "Mã đơn hàng bên sàn bán hàng — dùng để đối chiếu, tránh trừ trùng khi tải lại file có phần trùng lặp." },
    { column: "Tình trạng", required: false, description: "Tình trạng đơn bên sàn (VD: fulfilled, cancelled...) — chỉ lưu lại để tham khảo, KHÔNG lọc theo giá trị này, mọi dòng đều tính là đã xuất." },
    { column: "Ngày", required: true, description: "Ngày đơn hàng, định dạng dd/mm/yyyy." },
    { column: "Lineitem quantity", required: true, description: "Số lượng túi/chậu bán trong dòng này — số nguyên dương." },
    { column: "Tên SPF", required: false, description: "Tên sản phẩm hiển thị bên sàn — chỉ lưu lại để tham khảo." },
    {
      column: "Mã hàng",
      required: true,
      description: "Mã sản phẩm kèm quy cách — PHẢI chứa 1 trong các quy cách T01/T05/T10 (túi, trừ ở Phòng sản phẩm đạt) hoặc S/M/L/C (chậu, trừ ở Phòng cây trồng), ưu tiên đặt ở cuối mã, cách nhau bằng dấu \"-\" (VD MT001-T05).",
    },
    { column: "Tên nội bộ", required: true, description: "Phải khớp CHÍNH XÁC với Tên loại cây trong hệ thống — xem sheet Danh mục." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-xuat-cay.xlsx"`,
    },
  });
}
