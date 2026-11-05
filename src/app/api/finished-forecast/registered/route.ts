import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addGuideSheet, cellNumber, cellText, markRequiredHeaders } from "@/lib/excel-import";
import { canViewFinishedForecast, getUploadedRegistered, saveUploadedRegistered } from "@/lib/finished-stock-forecast";

const normalize = (s: string) => s.replace(/\*/g, "").trim().toLowerCase();

// Tháng trong file: "12/2026", "2026-12" hoặc ô kiểu ngày của Excel — trả "yyyy-MM", null nếu không hợp lệ.
function parseMonthCell(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  const text = cellText(value);
  const mmYyyy = /^(\d{1,2})[/-](\d{4})$/.exec(text);
  const month = mmYyyy ? `${mmYyyy[2]}-${mmYyyy[1].padStart(2, "0")}` : /^\d{4}-\d{2}$/.test(text) ? text : null;
  if (!month) return null;
  const m = Number(month.slice(5));
  return m >= 1 && m <= 12 ? month : null;
}

// Tải mẫu Excel số đăng ký sản xuất dùng cho Tồn kho dự kiến.
export async function GET() {
  const session = await auth();
  if (!canViewFinishedForecast(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Số đăng ký sản xuất");
  sheet.columns = [
    { header: "Mã cây", key: "code", width: 14 },
    { header: "Tháng", key: "month", width: 12 },
    { header: "Số lượng", key: "quantity", width: 14 },
    { header: "Khu sản xuất", key: "warehouse", width: 22 },
    { header: "NV cấy mô", key: "staff", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3]);
  sheet.getColumn(2).numFmt = "@";
  addGuideSheet(workbook, [
    { column: "Mã cây", required: true, description: "Mã cây đang có trong hệ thống" },
    { column: "Tháng", required: true, description: "Tháng sản xuất, dạng 12/2026" },
    { column: "Số lượng", required: true, description: "Số cây đăng ký, số nguyên không âm. Cùng mã cây và tháng thì tự cộng tổng" },
    { column: "Khu sản xuất", required: false, description: "Chỉ để tham khảo, hệ thống không dùng" },
    { column: "NV cấy mô", required: false, description: "Chỉ để tham khảo, hệ thống không dùng" },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau-so-dang-ky-san-xuat.xlsx"',
    },
  });
}

// Nhận file số đăng ký: có lỗi ở bất kỳ dòng nào thì không ghi gì. Tháng có trong file thay thế toàn bộ số cũ của
// tháng đó, tháng khác giữ nguyên.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canViewFinishedForecast(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Chưa chọn file" }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ message: "Không đọc được file — cần file Excel .xlsx" }, { status: 400 });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "File không có dữ liệu" }, { status: 400 });

  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => columns.set(normalize(cellText(cell.value)), col));
  const codeCol = columns.get("mã cây");
  const monthCol = columns.get("tháng");
  const quantityCol = columns.get("số lượng");
  if (!codeCol || !monthCol || !quantityCol) {
    return NextResponse.json({ message: "Dòng đầu của file cần có đủ 3 cột: Mã cây, Tháng, Số lượng" }, { status: 400 });
  }

  const plantTypes = await prisma.plantType.findMany({ select: { id: true, code: true } });
  const idByCode = new Map(plantTypes.map((p) => [p.code.toUpperCase(), p.id]));

  const errors: string[] = [];
  const months: Record<string, Record<string, number>> = {};
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const code = cellText(row.getCell(codeCol).value);
    const monthValue = row.getCell(monthCol).value;
    const quantity = cellNumber(row.getCell(quantityCol).value);
    if (!code && !cellText(monthValue) && quantity === undefined) return;

    const plantTypeId = idByCode.get(code.toUpperCase());
    const month = parseMonthCell(monthValue);
    if (!plantTypeId) errors.push(`Dòng ${rowNumber}: không có mã cây "${code}"`);
    if (!month) errors.push(`Dòng ${rowNumber}: tháng không hợp lệ, cần dạng 12/2026`);
    if (quantity === undefined || !Number.isInteger(quantity) || quantity < 0) errors.push(`Dòng ${rowNumber}: số lượng phải là số nguyên không âm`);
    if (!plantTypeId || !month || quantity === undefined || !Number.isInteger(quantity) || quantity < 0) return;

    months[month] ??= {};
    months[month][plantTypeId] = (months[month][plantTypeId] ?? 0) + quantity;
  });

  if (errors.length > 0) return NextResponse.json({ message: "File có lỗi, chưa lưu gì", errors: errors.slice(0, 50) }, { status: 400 });
  if (Object.keys(months).length === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });

  const current = await getUploadedRegistered();
  await saveUploadedRegistered({ ...current, ...months });

  return NextResponse.json({
    months: Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, rows]) => ({ month, plantCount: Object.keys(rows).length, quantity: Object.values(rows).reduce((s, q) => s + q, 0) })),
  });
}
