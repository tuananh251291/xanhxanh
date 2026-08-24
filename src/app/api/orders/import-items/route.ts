import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { cellText, cellNumber, styleExampleRow, markRequiredHeaders, addGuideSheet } from "@/lib/excel-import";
import { canActAsSale } from "@/types";

const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

// Tải mẫu Excel cho bảng "Bảng thông tin" của đơn hàng (STT/Mã cây/Tên cây/Quy cách/Số lượng/Yêu cầu
// đặc biệt) — chỉ chứa các dòng hàng, KHÔNG có thông tin đầu phiếu (khách hàng/thị trường/ngày xuất/mã
// xuất khẩu) vì những field đó cần chọn qua UI có sẵn (Combobox khách hàng theo đúng quyền xem), không
// hợp để gõ tay trong Excel. Xem POST /api/orders (route giữ đơn thật) cho các field đó.
export async function GET() {
  const session = await auth();
  if (!canActAsSale(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
    take: 5,
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Bảng thông tin");
  sheet.columns = [
    { header: "Mã cây", key: "plantTypeCode", width: 14 },
    { header: "Tên cây (chỉ tham khảo)", key: "plantTypeName", width: 28 },
    { header: "Quy cách", key: "stageCode", width: 12 },
    { header: "Số lượng (cây)", key: "quantity", width: 16 },
    { header: "Yêu cầu đặc biệt", key: "notes", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 3, 4]);
  sheet.addRow({
    plantTypeCode: plantTypes[0]?.code ?? "AL001",
    plantTypeName: plantTypes[0]?.name ?? "",
    stageCode: "T01",
    quantity: 100,
    notes: "",
  });
  styleExampleRow(sheet.getRow(2));

  if (plantTypes.length > 0) {
    const helpSheet = workbook.addWorksheet("Danh mục mã cây");
    helpSheet.columns = [
      { header: "Mã cây", key: "code", width: 14 },
      { header: "Tên cây", key: "name", width: 30 },
    ];
    helpSheet.getRow(1).font = { bold: true };
    for (const p of plantTypes) helpSheet.addRow({ code: p.code, name: p.name });
  }

  addGuideSheet(workbook, [
    { column: "Mã cây", required: true, description: "Đúng mã loại cây đã có trong hệ thống — sai mã sẽ báo lỗi khi tải lên." },
    { column: "Tên cây (chỉ tham khảo)", required: false, description: "Không đọc lại khi nhập — chỉ để người điền đối chiếu đúng mã cây." },
    { column: "Quy cách", required: true, description: "Chỉ nhận T01, T05 hoặc T10." },
    { column: "Số lượng (cây)", required: true, description: "Số nguyên dương." },
    { column: "Yêu cầu đặc biệt", required: false, description: "Ghi chú riêng cho dòng hàng này, hiện trên phiếu in." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau-dong-hang-don.xlsx"',
    },
  });
}

// Chỉ parse + validate — KHÔNG tạo đơn hàng ở đây. Client nhận `items` rồi tự chọn khách hàng/thị
// trường/ngày xuất/mã xuất khẩu qua UI, sau đó gọi thẳng POST /api/orders (đã tự kiểm tra tồn kho
// real-time trong transaction Serializable — không lặp lại logic đó ở route này).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canActAsSale(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Thiếu file" }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }

  const sheet = workbook.getWorksheet("Bảng thông tin") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = { row: number; plantTypeCode: string; stageCode: string; quantity?: number; notes?: string };
  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ
    const plantTypeCode = cellText(row.getCell(1).value);
    if (!plantTypeCode) return;
    parsedRows.push({
      row: rowNumber,
      plantTypeCode,
      stageCode: cellText(row.getCell(3).value),
      quantity: cellNumber(row.getCell(4).value),
      notes: cellText(row.getCell(5).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const errors: { row: number; label: string; message: string }[] = [];
  const items: { plantTypeId: string; plantTypeCode: string; plantTypeName: string; stageCode: string; quantity: number; notes?: string }[] = [];

  for (const parsed of parsedRows) {
    const plantType = await prisma.plantType.findUnique({
      where: { code: parsed.plantTypeCode },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!plantType || !plantType.isActive) {
      errors.push({ row: parsed.row, label: parsed.plantTypeCode, message: `Không tìm thấy mã cây "${parsed.plantTypeCode}"` });
      continue;
    }
    if (!FINISHED_STAGE_CODES.has(parsed.stageCode)) {
      errors.push({ row: parsed.row, label: parsed.plantTypeCode, message: `Quy cách "${parsed.stageCode}" không hợp lệ (T01/T05/T10)` });
      continue;
    }
    if (parsed.quantity === undefined || !Number.isFinite(parsed.quantity) || parsed.quantity <= 0 || !Number.isInteger(parsed.quantity)) {
      errors.push({ row: parsed.row, label: parsed.plantTypeCode, message: "Số lượng phải là số nguyên dương" });
      continue;
    }
    items.push({
      plantTypeId: plantType.id, plantTypeCode: plantType.code, plantTypeName: plantType.name,
      stageCode: parsed.stageCode, quantity: parsed.quantity, notes: parsed.notes,
    });
  }

  if (errors.length > 0) return NextResponse.json({ items: [], errors });
  return NextResponse.json({ items, errors: [] });
}
