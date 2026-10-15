import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { cellText, cellNumber, styleExampleRow, markRequiredHeaders, addGuideSheet } from "@/lib/excel-import";
import { canActAsSale } from "@/types";

const FINISHED_STAGE_CODES = new Set(["T01", "T05", "T10"]);

// Tải mẫu Excel cho bảng "Bảng thông tin" của đơn hàng (Mã cây/Tên cây/Quy cách/Số lượng/Yêu cầu đặc
// biệt + Mã khách hàng/Mã NV bán hàng). Mã khách hàng/Mã NV bán hàng là thông tin ĐẦU PHIẾU (1 đơn = 1
// khách) nên chỉ cần điền ở dòng dữ liệu đầu tiên — đọc xong chỉ điền sẵn vào ô chọn trên UI, vẫn đổi lại
// được. Thị trường/ngày xuất/mã xuất khẩu vẫn chọn qua UI. Hai cột này nằm SAU cùng (F, G) để file mẫu cũ
// (chỉ 5 cột) vẫn đọc được với Sale. Cột Mã NV bán hàng chỉ có ở mẫu của Quản lý kho thành phẩm tạo hộ —
// Sale tự tạo thì NV bán hàng luôn là chính mình.
export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  if (!canActAsSale(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const isActingForSale = role === "QUAN_LY_KHO_THANH_PHAM";

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
    { header: "Mã khách hàng", key: "customerCode", width: 16 },
    ...(isActingForSale ? [{ header: "Mã NV bán hàng", key: "saleCode", width: 16 }] : []),
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, isActingForSale ? [1, 3, 4, 6, 7] : [1, 3, 4]);
  sheet.addRow({
    plantTypeCode: plantTypes[0]?.code ?? "AL001",
    plantTypeName: plantTypes[0]?.name ?? "",
    stageCode: "T01",
    quantity: 100,
    notes: "",
    customerCode: "KH00001",
    ...(isActingForSale ? { saleCode: "NVS01" } : {}),
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

  if (isActingForSale) {
    const salesUsers = await prisma.user.findMany({
      where: { role: "SALE", isActive: true, status: "APPROVED" },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    });
    const salesSheet = workbook.addWorksheet("Danh mục NV bán hàng");
    salesSheet.columns = [
      { header: "Mã NV bán hàng", key: "code", width: 16 },
      { header: "Tên NV bán hàng", key: "name", width: 30 },
    ];
    salesSheet.getRow(1).font = { bold: true };
    for (const u of salesUsers) salesSheet.addRow({ code: u.code, name: u.name });
  }

  addGuideSheet(workbook, [
    { column: "Mã cây", required: true, description: "Đúng mã loại cây đã có trong hệ thống — sai mã sẽ báo lỗi khi tải lên." },
    { column: "Tên cây (chỉ tham khảo)", required: false, description: "Không đọc lại khi nhập — chỉ để người điền đối chiếu đúng mã cây." },
    { column: "Quy cách", required: true, description: "Chỉ nhận T01, T05 hoặc T10." },
    { column: "Số lượng (cây)", required: true, description: "Số nguyên dương." },
    { column: "Yêu cầu đặc biệt", required: false, description: "Ghi chú riêng cho dòng hàng này, hiện trên phiếu in." },
    {
      column: "Mã khách hàng",
      required: isActingForSale,
      description: isActingForSale
        ? "Mã khách (VD KH00001) — chỉ cần điền ở dòng dữ liệu đầu tiên, các dòng sau để trống hoặc ghi giống hệt. Không bắt buộc có trong danh mục Khách hàng; nếu đã có thì khách phải do đúng NV bán hàng ở cột bên cạnh phụ trách."
        : "Mã khách bạn đang phụ trách (VD KH00001) — chỉ cần điền ở dòng dữ liệu đầu tiên; để trống thì chọn khách trên màn hình.",
    },
    ...(isActingForSale
      ? [{ column: "Mã NV bán hàng", required: true, description: "Mã NV bán hàng phụ trách khách (VD NVS01, xem sheet Danh mục NV bán hàng) — chỉ cần điền ở dòng dữ liệu đầu tiên." }]
      : []),
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
  if (!session?.user || !canActAsSale(session.user.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const isActingForSale = session.user.role === "QUAN_LY_KHO_THANH_PHAM";

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

  type ParsedRow = { row: number; plantTypeCode: string; stageCode: string; quantity?: number; notes?: string; customerCode: string; saleCode: string };
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
      customerCode: cellText(row.getCell(6).value).toUpperCase(),
      saleCode: isActingForSale ? cellText(row.getCell(7).value).toUpperCase() : "",
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

  // Mã khách hàng/Mã NV bán hàng — thông tin đầu phiếu, lấy giá trị đầu tiên có điền; dòng nào ghi khác
  // giá trị đó thì báo lỗi (1 file = 1 đơn = 1 khách).
  const firstRow = parsedRows[0].row;
  const pickHeaderValue = (field: "customerCode" | "saleCode", label: string): string => {
    const first = parsedRows.find((r) => r[field]);
    if (!first) return "";
    for (const r of parsedRows) {
      if (r[field] && r[field] !== first[field]) {
        errors.push({ row: r.row, label, message: `${label} "${r[field]}" khác dòng ${first.row} ("${first[field]}") — 1 file chỉ tạo 1 đơn cho 1 khách` });
      }
    }
    return first[field];
  };
  const customerCode = pickHeaderValue("customerCode", "Mã khách hàng");
  const saleCode = pickHeaderValue("saleCode", "Mã NV bán hàng");

  let customerId: string | undefined;
  let freeCustomerCode: string | undefined;
  let saleUserId: string | undefined;
  if (isActingForSale && !customerCode) {
    errors.push({ row: firstRow, label: "Mã khách hàng", message: "Thiếu Mã khách hàng" });
  }
  if (isActingForSale && !saleCode) {
    errors.push({ row: firstRow, label: "Mã NV bán hàng", message: "Thiếu Mã NV bán hàng" });
  }
  if (saleCode) {
    const saleUser = await prisma.user.findUnique({ where: { code: saleCode }, select: { id: true, role: true, isActive: true } });
    if (!saleUser || saleUser.role !== "SALE" || !saleUser.isActive) {
      errors.push({ row: firstRow, label: saleCode, message: `Không tìm thấy NV bán hàng mã "${saleCode}"` });
    } else {
      saleUserId = saleUser.id;
    }
  }
  if (customerCode) {
    const customer = await prisma.customer.findUnique({ where: { code: customerCode }, select: { id: true, assignedToId: true } });
    if (!customer && isActingForSale) {
      // Quản lý kho thành phẩm tạo hộ — mã khách KHÔNG bắt buộc có trong danh mục (xem freeCustomerCode,
      // POST /api/orders): trả về nguyên mã để điền sẵn vào ô gõ tay trên form.
      freeCustomerCode = customerCode;
    } else if (!customer) {
      errors.push({ row: firstRow, label: customerCode, message: `Không tìm thấy khách hàng mã "${customerCode}"` });
    } else if (!isActingForSale && customer.assignedToId !== session.user.id) {
      errors.push({ row: firstRow, label: customerCode, message: "Bạn không phụ trách khách hàng này" });
    } else if (isActingForSale && !customer.assignedToId) {
      errors.push({ row: firstRow, label: customerCode, message: "Khách hàng chưa có NV bán hàng phụ trách — không tạo được đơn hộ" });
    } else if (saleUserId && customer.assignedToId !== saleUserId) {
      errors.push({ row: firstRow, label: customerCode, message: `Khách hàng "${customerCode}" không do NV bán hàng "${saleCode}" phụ trách` });
    } else {
      customerId = customer.id;
    }
  }

  if (errors.length > 0) return NextResponse.json({ items: [], errors });
  return NextResponse.json({ items, errors: [], customerId, freeCustomerCode, saleUserId });
}
