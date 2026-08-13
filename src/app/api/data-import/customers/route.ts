import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { normalizeCustomerName, normalizeWebsite } from "@/lib/customer";

type RowError = { row: number; label: string; message: string };

const STATUS_TEXT: Record<string, "CHUA_PHAN_CONG" | "DA_PHAN_CONG"> = {
  "đã phân công": "DA_PHAN_CONG",
  "chưa phân công": "CHUA_PHAN_CONG",
};

// Nhập hàng loạt/cập nhật danh sách khách hàng — cập nhật thay thế theo khoá tự nhiên là Website
// (chuẩn hoá qua normalizeWebsite, xem src/lib/customer.ts): khớp Website đã có -> update, chưa có ->
// tạo mới. KHÔNG có cột "Nhân viên quản lý" — đó là dữ liệu suy ra từ Cài đặt Sale → NV quản lý (theo
// cặp NV phụ trách + Thị trường), cấu hình riêng ở /settings/sale/managers, không gán theo từng khách.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel khách hàng" }, { status: 403 });
  }

  const [markets, staff] = await Promise.all([
    prisma.market.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({ where: { role: "SALE" }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Khách hàng");
  sheet.columns = [
    { header: "Tên khách hàng - công ty", key: "name", width: 30 },
    { header: "Website", key: "website", width: 26 },
    { header: "Mã thị trường", key: "marketCode", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "Số điện thoại", key: "phone", width: 16 },
    { header: "Trạng thái (Đã phân công / Chưa phân công)", key: "status", width: 30 },
    { header: "Ngày đầu tiếp cận (dd/mm/yyyy)", key: "firstContactAt", width: 22 },
    { header: "Ngày ra đơn gần nhất (dd/mm/yyyy)", key: "lastOrderAt", width: 24 },
    { header: "Mã đơn gần nhất", key: "lastOrderCode", width: 18 },
    { header: "Mã NV phụ trách", key: "assignedToCode", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3, 4, 5, 6, 7]);
  sheet.addRow({
    name: "ABC Import Export Co., Ltd",
    website: "abc-import.com",
    marketCode: markets[0]?.code ?? "EU",
    email: "contact@abc-import.com",
    phone: "0901234567",
    status: "Chưa phân công",
    firstContactAt: "15/01/2026",
    lastOrderAt: "",
    lastOrderCode: "",
    assignedToCode: "",
  });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 18 },
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên", key: "name", width: 26 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const m of markets) helpSheet.addRow({ type: "Mã thị trường", code: m.code, name: m.name });
  for (const s of staff) helpSheet.addRow({ type: "Mã NV bán hàng", code: s.code, name: s.name });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Khớp Website đã có trong hệ thống thì CẬP NHẬT THAY THẾ dòng đó, chưa có thì TẠO MỚI." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Trạng thái Đã phân công bắt buộc kèm Mã NV phụ trách; Chưa phân công thì để trống Mã NV phụ trách." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Nhân viên quản lý KHÔNG nhập ở đây — cấu hình riêng tại Cài đặt Sale → NV quản lý (theo NV phụ trách + Thị trường)." });

  addGuideSheet(workbook, [
    { column: "Tên khách hàng - công ty", required: true, description: "Tên công ty khách hàng." },
    { column: "Website", required: true, description: "Dùng để kiểm tra trùng khách và làm khoá cập nhật khi nhập lại file." },
    { column: "Mã thị trường", required: true, description: "Phải khớp đúng 1 Mã thị trường đã có (xem sheet Danh mục)." },
    { column: "Email", required: true, description: "Email liên hệ khách hàng." },
    { column: "Số điện thoại", required: true, description: "Số điện thoại liên hệ khách hàng." },
    { column: "Trạng thái", required: true, description: `Chỉ nhận 1 trong 2 giá trị: "Đã phân công" hoặc "Chưa phân công".` },
    { column: "Ngày đầu tiếp cận", required: true, description: "Định dạng dd/mm/yyyy." },
    { column: "Ngày ra đơn gần nhất", required: false, description: "Định dạng dd/mm/yyyy, để trống nếu chưa có đơn." },
    { column: "Mã đơn gần nhất", required: false, description: "Để trống nếu chưa có đơn." },
    { column: "Mã NV phụ trách", required: false, description: `Bắt buộc khi Trạng thái = "Đã phân công" (xem sheet Danh mục để lấy đúng mã). Để trống khi "Chưa phân công".` },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-khach-hang.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel khách hàng" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Khách hàng") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    name: string;
    website: string;
    marketCode: string;
    email: string;
    phone: string;
    statusText: string;
    firstContactAtRaw: ReturnType<typeof cellDate>;
    lastOrderAtRaw: ReturnType<typeof cellDate>;
    lastOrderCode: string;
    assignedToCode: string;
  };
  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const name = cellText(row.getCell(1).value);
    if (!name) return;
    parsedRows.push({
      row: rowNumber,
      name,
      website: cellText(row.getCell(2).value),
      marketCode: cellText(row.getCell(3).value).toUpperCase(),
      email: cellText(row.getCell(4).value),
      phone: cellText(row.getCell(5).value),
      statusText: cellText(row.getCell(6).value),
      firstContactAtRaw: cellDate(row.getCell(7).value),
      lastOrderAtRaw: cellDate(row.getCell(8).value),
      lastOrderCode: cellText(row.getCell(9).value),
      assignedToCode: cellText(row.getCell(10).value).toUpperCase(),
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const [markets, staffList] = await Promise.all([
    prisma.market.findMany({ select: { id: true, code: true } }),
    prisma.user.findMany({ select: { id: true, code: true } }),
  ]);
  const marketByCode = new Map(markets.map((m) => [m.code, m.id]));
  const staffByCode = new Map(staffList.map((s) => [s.code, s.id]));

  type ValidRow = {
    row: number;
    label: string;
    name: string;
    website: string;
    websiteNormalized: string;
    nameNormalized: string;
    marketId: string;
    email: string;
    phone: string;
    status: "CHUA_PHAN_CONG" | "DA_PHAN_CONG";
    firstContactAt: Date;
    lastOrderAt: Date | null;
    lastOrderCode: string | null;
    assignedToId: string | null;
  };
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedWebsites = new Set<string>();

  for (const parsed of parsedRows) {
    const label = parsed.name;
    if (!parsed.website) { errors.push({ row: parsed.row, label, message: "Thiếu Website" }); continue; }
    const websiteNormalized = normalizeWebsite(parsed.website);
    if (claimedWebsites.has(websiteNormalized)) {
      errors.push({ row: parsed.row, label, message: "Website trùng với 1 dòng khác trong file" });
      continue;
    }

    const marketId = marketByCode.get(parsed.marketCode);
    if (!marketId) { errors.push({ row: parsed.row, label, message: `Mã thị trường "${parsed.marketCode}" không tồn tại` }); continue; }

    if (!parsed.email || !parsed.email.includes("@")) { errors.push({ row: parsed.row, label, message: "Email không hợp lệ" }); continue; }
    if (!parsed.phone) { errors.push({ row: parsed.row, label, message: "Thiếu Số điện thoại" }); continue; }

    const status = STATUS_TEXT[parsed.statusText.trim().toLowerCase()];
    if (!status) { errors.push({ row: parsed.row, label, message: `Trạng thái phải là "Đã phân công" hoặc "Chưa phân công"` }); continue; }

    if (parsed.firstContactAtRaw === undefined) { errors.push({ row: parsed.row, label, message: "Thiếu Ngày đầu tiếp cận" }); continue; }
    if (parsed.firstContactAtRaw === null) { errors.push({ row: parsed.row, label, message: "Ngày đầu tiếp cận không đúng định dạng dd/mm/yyyy" }); continue; }
    if (parsed.lastOrderAtRaw === null) { errors.push({ row: parsed.row, label, message: "Ngày ra đơn gần nhất không đúng định dạng dd/mm/yyyy" }); continue; }

    let assignedToId: string | null = null;
    if (status === "DA_PHAN_CONG") {
      if (!parsed.assignedToCode) { errors.push({ row: parsed.row, label, message: `Trạng thái "Đã phân công" cần Mã NV phụ trách` }); continue; }
      const staffId = staffByCode.get(parsed.assignedToCode);
      if (!staffId) { errors.push({ row: parsed.row, label, message: `Mã NV phụ trách "${parsed.assignedToCode}" không tồn tại` }); continue; }
      assignedToId = staffId;
    }

    claimedWebsites.add(websiteNormalized);
    validRows.push({
      row: parsed.row,
      label,
      name: parsed.name,
      website: parsed.website,
      websiteNormalized,
      nameNormalized: normalizeCustomerName(parsed.name),
      marketId,
      email: parsed.email,
      phone: parsed.phone,
      status,
      firstContactAt: parsed.firstContactAtRaw,
      lastOrderAt: parsed.lastOrderAtRaw ?? null,
      lastOrderCode: parsed.lastOrderCode || null,
      assignedToId,
    });
  }

  let successCount = 0;
  if (validRows.length > 0 && errors.length === 0) {
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        const existing = await tx.customer.findFirst({ where: { websiteNormalized: vr.websiteNormalized }, select: { id: true } });
        const data = {
          name: vr.name,
          nameNormalized: vr.nameNormalized,
          website: vr.website,
          websiteNormalized: vr.websiteNormalized,
          marketId: vr.marketId,
          email: vr.email,
          phone: vr.phone,
          status: vr.status,
          firstContactAt: vr.firstContactAt,
          lastOrderAt: vr.lastOrderAt,
          lastOrderCode: vr.lastOrderCode,
          assignedToId: vr.assignedToId,
        };
        if (existing) {
          await tx.customer.update({ where: { id: existing.id }, data });
        } else {
          await tx.customer.create({ data });
        }
        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
