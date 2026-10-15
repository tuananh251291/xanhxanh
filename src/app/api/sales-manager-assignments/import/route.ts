import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageSaleCustomers } from "@/types";
import { addGuideSheet, cellText, markRequiredHeaders, styleExampleRow } from "@/lib/excel-import";
import { applySalesManagerRows, validateSalesManagerRows, type SalesManagerImportRow } from "@/lib/sales-manager-import";

const SHEET_NAME = "Phân công quản lý";

// File mẫu: sheet phân công + sheet Danh mục (mã NV bán hàng, mã thị trường) + Hướng dẫn.
export async function GET() {
  const session = await auth();
  if (!canManageSaleCustomers(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const [sales, markets, assignments] = await Promise.all([
    prisma.user.findMany({ where: { role: "SALE", isActive: true }, select: { code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.market.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.salesManagerAssignment.findMany({
      select: { manager: { select: { code: true } }, salesUser: { select: { code: true } }, market: { select: { code: true } } },
      orderBy: [{ market: { code: "asc" } }, { salesUser: { name: "asc" } }],
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [
    { header: "Mã NV quản lý", key: "manager", width: 18 },
    { header: "Mã NV bán hàng", key: "sales", width: 18 },
    { header: "Mã thị trường", key: "market", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3]);
  sheet.addRow({ manager: sales[0]?.code ?? "NVS01", sales: sales[1]?.code ?? "NVS02", market: markets[0]?.code ?? "VN" });
  styleExampleRow(sheet.getRow(2));
  // Điền sẵn phân công hiện tại để sửa trực tiếp thay vì gõ lại từ đầu.
  for (const a of assignments) sheet.addRow({ manager: a.manager.code, sales: a.salesUser.code, market: a.market.code });

  const help = workbook.addWorksheet("Danh mục");
  help.columns = [
    { header: "Loại", key: "type", width: 18 },
    { header: "Mã", key: "code", width: 16 },
    { header: "Tên", key: "name", width: 36 },
  ];
  help.getRow(1).font = { bold: true };
  for (const s of sales) help.addRow({ type: "NV bán hàng", code: s.code, name: s.name });
  for (const m of markets) help.addRow({ type: "Thị trường", code: m.code, name: m.name });

  addGuideSheet(workbook, [
    { column: "Mã NV quản lý", required: true, description: "Mã NV bán hàng làm quản lý (xem sheet Danh mục)." },
    { column: "Mã NV bán hàng", required: true, description: "Mã NV bán hàng được quản lý." },
    { column: "Mã thị trường", required: true, description: "Mã thị trường (xem sheet Danh mục). Mỗi cặp NV bán hàng + thị trường chỉ xuất hiện 1 dòng." },
    { column: "Cách cập nhật", required: false, description: "Dòng có trong file: thêm mới hoặc đổi NV quản lý cho cặp NV bán hàng + thị trường đó. Phân công KHÔNG có trong file giữ nguyên. File có lỗi ở bất kỳ dòng nào sẽ không được tải lên." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-phan-cong-nhan-vien-quan-ly.xlsx"`,
    },
  });
}

// Tải file lên: lỗi bất kỳ dòng nào → từ chối cả file (trả danh sách lỗi). Admin cấp cao → áp ngay; NV Trợ lý →
// tạo yêu cầu chờ Admin cấp cao duyệt (SalesManagerImportRequest) + báo Admin cấp cao.
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !canManageSaleCustomers(role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });
  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  const rows: SalesManagerImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = tiêu đề, dòng 2 = ví dụ
    const r = { row: rowNumber, managerCode: cellText(row.getCell(1).value), salesCode: cellText(row.getCell(2).value), marketCode: cellText(row.getCell(3).value) };
    if (r.managerCode || r.salesCode || r.marketCode) rows.push(r);
  });

  const { errors, resolved } = await validateSalesManagerRows(rows);
  if (errors.length) {
    return NextResponse.json({ message: `File có ${errors.length} lỗi — không tải lên. Sửa rồi tải lại.`, errors }, { status: 400 });
  }
  const changes = resolved.filter((r) => r.change !== "same").length;
  if (changes === 0) return NextResponse.json({ message: "File không có thay đổi nào so với phân công hiện tại", applied: false });

  if (role === "SUPER_ADMIN") {
    const result = await prisma.$transaction((tx) => applySalesManagerRows(tx, resolved));
    return NextResponse.json({ message: `Đã cập nhật: ${result.created} phân công mới, ${result.updated} đổi NV quản lý`, applied: true });
  }

  await prisma.$transaction(async (tx) => {
    const request = await tx.salesManagerImportRequest.create({
      data: {
        fileName: file.name,
        rows: rows as unknown as Prisma.InputJsonValue,
        rowCount: rows.length,
        createdById: session.user.id,
      },
    });
    await tx.alert.create({
      data: {
        type: "SALES_MANAGER_IMPORT_PENDING",
        targetRole: "SUPER_ADMIN",
        title: "Yêu cầu duyệt phân công Nhân viên quản lý",
        message: `${session.user.name ?? "NV Trợ lý"} tải lên file "${file.name}" — ${changes} thay đổi phân công cần duyệt.`,
        relatedId: request.id,
        relatedType: "SalesManagerImportRequest",
      },
    });
  });
  return NextResponse.json({ message: `Đã gửi ${changes} thay đổi cho Admin cấp cao duyệt — phân công chỉ đổi sau khi được duyệt.`, applied: false, pending: true });
}
