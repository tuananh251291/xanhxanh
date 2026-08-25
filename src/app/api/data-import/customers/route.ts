import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { normalizeCustomerName, normalizeWebsite } from "@/lib/customer";
import { generateCustomerCode } from "@/lib/codes";

type RowError = { row: number; label: string; message: string };

const STATUS_TEXT: Record<string, "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH"> = {
  "đã phân công": "DA_PHAN_CONG",
  "chưa phân công": "CHUA_PHAN_CONG",
  "mặc định": "MAC_DINH",
};

const CUSTOMER_GROUP_TEXT: Record<string, "KHACH_SI_NHO" | "KHACH_CONG_TY" | "KHACH_CONG_TY_LON"> = {
  "khách sỉ nhỏ": "KHACH_SI_NHO",
  "khách công ty": "KHACH_CONG_TY",
  "khách công ty lớn": "KHACH_CONG_TY_LON",
};

// Nhập hàng loạt/cập nhật danh sách khách hàng — cập nhật thay thế theo khoá tự nhiên là Website
// (chuẩn hoá qua normalizeWebsite, xem src/lib/customer.ts): khớp Website đã có -> update, chưa có ->
// tạo mới. Website/SĐT/Email đều KHÔNG bắt buộc riêng lẻ — chỉ cần ÍT NHẤT 1 trong 3 (khớp đúng ràng buộc
// ở /api/customer-check) — CHỈ 3 cột Tên công ty/Thị trường/Trạng thái LUÔN bắt buộc. Để trống Website
// thì dòng đó LUÔN được TẠO MỚI (không dùng làm khoá cập nhật được vì nhiều dòng cùng để trống Website sẽ
// không phân biệt được với nhau). "Mã NV quản lý" nhập vào sẽ TỰ GÁN/CẬP NHẬT bảng SalesManagerAssignment
// cho đúng cặp (NV phụ trách, Thị trường) của dòng đó (khác quyết định trước đây — lúc đó chưa cho nhập
// cột này qua Excel, chỉ cấu hình tay ở /settings/sale/managers; giờ cho phép cả 2 cách).
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
    { header: "Tên công ty", key: "name", width: 30 },
    { header: "Website", key: "website", width: 26 },
    { header: "Thị trường (Mã)", key: "marketCode", width: 16 },
    { header: "Trạng thái (Đã phân công / Chưa phân công / Mặc định)", key: "status", width: 34 },
    { header: "SĐT", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "Ngày đầu tiếp cận (dd/mm/yyyy)", key: "firstContactAt", width: 22 },
    { header: "Ngày ra đơn gần nhất (dd/mm/yyyy)", key: "lastOrderAt", width: 24 },
    { header: "Mã đơn gần nhất", key: "lastOrderCode", width: 18 },
    { header: "Mã NV phụ trách", key: "assignedToCode", width: 18 },
    { header: "Mã NV quản lý", key: "managerCode", width: 18 },
    { header: "Nhóm khách hàng (Khách sỉ nhỏ / Khách công ty / Khách công ty lớn)", key: "customerGroup", width: 34 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 3, 4]);
  sheet.addRow({
    name: "ABC Import Export Co., Ltd",
    website: "abc-import.com",
    marketCode: markets[0]?.code ?? "EU",
    status: "Chưa phân công",
    phone: "0901234567",
    email: "contact@abc-import.com",
    firstContactAt: "",
    lastOrderAt: "",
    lastOrderCode: "",
    assignedToCode: "",
    managerCode: "",
    customerGroup: "",
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
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Chỉ 3 cột có dấu * (Tên công ty, Thị trường, Trạng thái) là bắt buộc — mọi cột khác để trống vẫn nhập được." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Website/SĐT/Email không bắt buộc từng cột riêng, nhưng mỗi dòng phải có ÍT NHẤT 1 trong 3 cột này." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Khớp Website đã có trong hệ thống thì CẬP NHẬT THAY THẾ dòng đó, chưa có thì TẠO MỚI. Để trống Website thì dòng đó LUÔN tạo mới (không dùng làm khoá cập nhật được)." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Để trống 1 cột không bắt buộc: khách MỚI để trống thật (riêng Ngày đầu tiếp cận thì lấy ngày hôm nay); khách ĐÃ CÓ (khớp Website) thì GIỮ NGUYÊN giá trị cũ của đúng cột đó, không bị xoá." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Trạng thái Đã phân công/Mặc định bắt buộc kèm Mã NV phụ trách; Chưa phân công thì để trống Mã NV phụ trách." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mặc định = khách VIP/lâu năm gắn cố định với NV phụ trách, không bị nhắc cập nhật hàng tháng và không tự thu hồi về Chưa phân công dù không có đơn." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã NV quản lý: điền vào sẽ TỰ GÁN/CẬP NHẬT người quản lý cho đúng (NV phụ trách, Thị trường) của dòng đó — chỉ điền khi đã có Mã NV phụ trách. Được phép trùng chính Mã NV phụ trách (NV tự quản lý mình)." });

  addGuideSheet(workbook, [
    { column: "Tên công ty", required: true, description: "Tên công ty khách hàng." },
    { column: "Website", required: false, description: "Dùng để kiểm tra trùng khách và làm khoá cập nhật khi nhập lại file — để trống được nếu đã có SĐT hoặc Email, nhưng để trống thì dòng đó luôn TẠO MỚI (không cập nhật được khách cũ)." },
    { column: "Thị trường (Mã)", required: true, description: "Phải khớp đúng 1 Mã thị trường đã có (xem sheet Danh mục)." },
    { column: "Trạng thái", required: true, description: `Chỉ nhận 1 trong 3 giá trị: "Đã phân công", "Chưa phân công" hoặc "Mặc định" (khách VIP/lâu năm, không bị nhắc cập nhật/không tự thu hồi).` },
    { column: "SĐT", required: false, description: "Số điện thoại liên hệ — để trống được nếu đã có Website hoặc Email." },
    { column: "Email", required: false, description: "Email liên hệ — để trống được nếu đã có Website hoặc SĐT." },
    { column: "Ngày đầu tiếp cận", required: false, description: "Định dạng dd/mm/yyyy. Để trống: khách mới lấy ngày hôm nay, khách đã có giữ nguyên ngày cũ." },
    { column: "Ngày ra đơn gần nhất", required: false, description: "Định dạng dd/mm/yyyy, để trống nếu chưa có đơn." },
    { column: "Mã đơn gần nhất", required: false, description: "Để trống nếu chưa có đơn." },
    { column: "Mã NV phụ trách", required: false, description: `Bắt buộc khi Trạng thái = "Đã phân công" hoặc "Mặc định" (xem sheet Danh mục để lấy đúng mã). Để trống khi "Chưa phân công".` },
    { column: "Mã NV quản lý", required: false, description: "Tự gán/cập nhật người quản lý cho cặp (NV phụ trách, Thị trường) của dòng này — cần điền kèm Mã NV phụ trách." },
    { column: "Nhóm khách hàng", required: false, description: `Chỉ nhận "Khách sỉ nhỏ", "Khách công ty" hoặc "Khách công ty lớn" — để trống: khách mới thành chưa phân loại, khách đã có giữ nguyên nhóm cũ. Khách công ty lớn được giữ đơn 5 tháng thay vì theo Năng lực giữ đơn của NV Sale.` },
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
    statusText: string;
    phone: string;
    email: string;
    firstContactAtRaw: ReturnType<typeof cellDate>;
    lastOrderAtRaw: ReturnType<typeof cellDate>;
    lastOrderCode: string;
    assignedToCode: string;
    managerCode: string;
    customerGroupText: string;
  };
  // Ô KHÔNG phải ô gốc của 1 vùng merge (VD merge B26:B54) đọc value qua ExcelJS sẽ trả về y hệt ô gốc
  // (B27..B54 đều "thấy" giống B26) dù nhìn trên Excel các ô đó có vẻ trống/không merge rõ ràng — dữ liệu
  // dính merge kiểu này gần như luôn là lỗi định dạng khi copy-paste từ file khác (không phải giá trị
  // thật của dòng), đọc thành rỗng thay vì để lọt vào so trùng/lưu nhầm dữ liệu của dòng khác.
  const ownCellValue = (cell: ExcelJS.Cell): ExcelJS.CellValue => (cell.type === ExcelJS.ValueType.Merge ? null : cell.value);

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return;
    const name = cellText(ownCellValue(row.getCell(1)));
    if (!name) return;
    parsedRows.push({
      row: rowNumber,
      name,
      website: cellText(ownCellValue(row.getCell(2))),
      marketCode: cellText(ownCellValue(row.getCell(3))).toUpperCase(),
      statusText: cellText(ownCellValue(row.getCell(4))),
      phone: cellText(ownCellValue(row.getCell(5))),
      email: cellText(ownCellValue(row.getCell(6))),
      firstContactAtRaw: cellDate(ownCellValue(row.getCell(7))),
      lastOrderAtRaw: cellDate(ownCellValue(row.getCell(8))),
      lastOrderCode: cellText(ownCellValue(row.getCell(9))),
      assignedToCode: cellText(ownCellValue(row.getCell(10))).toUpperCase(),
      managerCode: cellText(ownCellValue(row.getCell(11))).toUpperCase(),
      customerGroupText: cellText(ownCellValue(row.getCell(12))),
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const [markets, staffList, existingCustomers] = await Promise.all([
    prisma.market.findMany({ select: { id: true, code: true } }),
    // Chỉ NV bán hàng (SALE) mới được làm Nhân viên phụ trách/Nhân viên quản lý — khớp đúng ràng buộc đã
    // áp dụng ở POST /api/sales-manager-assignments (2 vế đều phải role SALE).
    prisma.user.findMany({ where: { role: "SALE" }, select: { id: true, code: true } }),
    prisma.customer.findMany({ select: { id: true, websiteNormalized: true, firstContactAt: true } }),
  ]);
  const marketByCode = new Map(markets.map((m) => [m.code, m.id]));
  const staffByCode = new Map(staffList.map((s) => [s.code, s.id]));
  const existingByWebsite = new Map(existingCustomers.map((c) => [c.websiteNormalized, c]));

  type ValidRow = {
    row: number;
    label: string;
    name: string;
    website: string;
    websiteNormalized: string;
    nameNormalized: string;
    marketId: string;
    // undefined = không đổi (để trống trong file, khách ĐÃ CÓ giữ nguyên giá trị cũ; khách MỚI thì thành
    // null) — áp dụng thống nhất cho mọi trường không bắt buộc, tránh 1 lượt nhập chỉ sửa vài cột lại vô
    // tình xoá sạch dữ liệu các cột khác đã có từ trước.
    email: string | null | undefined;
    phone: string | null | undefined;
    status: "CHUA_PHAN_CONG" | "DA_PHAN_CONG" | "MAC_DINH";
    firstContactAt: Date | undefined;
    lastOrderAt: Date | null | undefined;
    lastOrderCode: string | null | undefined;
    assignedToId: string | null;
    customerGroup: "KHACH_SI_NHO" | "KHACH_CONG_TY" | "KHACH_CONG_TY_LON" | null | undefined;
  };
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedWebsites = new Map<string, { row: number; label: string }>();
  // key "salesUserId:marketId" -> { managerId, managerCode, row } — phát hiện 2 dòng trong CÙNG file ghi
  // khác nhau cho cùng 1 cặp (NV phụ trách, Thị trường).
  const managerAssignments = new Map<string, { managerId: string; managerCode: string; row: number }>();

  for (const parsed of parsedRows) {
    const label = parsed.name;
    if (!parsed.website && !parsed.phone && !parsed.email) {
      errors.push({ row: parsed.row, label, message: "Cần nhập ít nhất 1 trong 3: Website, SĐT hoặc Email" });
      continue;
    }
    // Để trống Website: không dùng làm khoá so trùng/cập nhật được (nhiều dòng cùng để trống sẽ không
    // phân biệt được với nhau) — luôn coi là tạo mới, bỏ qua toàn bộ kiểm tra trùng Website bên dưới.
    const websiteNormalized = parsed.website ? normalizeWebsite(parsed.website) : "";
    const claimedBy = websiteNormalized ? claimedWebsites.get(websiteNormalized) : undefined;
    if (claimedBy) {
      errors.push({
        row: parsed.row, label,
        message: `Website trùng với dòng ${claimedBy.row} (${claimedBy.label}) trong file — sau khi bỏ "http(s)://"/"www."/dấu "/" cuối, 2 link này giống hệt nhau`,
      });
      continue;
    }

    if (!parsed.marketCode) { errors.push({ row: parsed.row, label, message: "Thiếu Thị trường" }); continue; }
    const marketId = marketByCode.get(parsed.marketCode);
    if (!marketId) { errors.push({ row: parsed.row, label, message: `Mã thị trường "${parsed.marketCode}" không tồn tại` }); continue; }

    if (parsed.email && !parsed.email.includes("@")) { errors.push({ row: parsed.row, label, message: "Email không hợp lệ" }); continue; }

    if (!parsed.statusText.trim()) { errors.push({ row: parsed.row, label, message: "Thiếu Trạng thái" }); continue; }
    const status = STATUS_TEXT[parsed.statusText.trim().toLowerCase()];
    if (!status) { errors.push({ row: parsed.row, label, message: `Trạng thái phải là "Đã phân công", "Chưa phân công" hoặc "Mặc định"` }); continue; }

    if (parsed.firstContactAtRaw === null) { errors.push({ row: parsed.row, label, message: "Ngày đầu tiếp cận không đúng định dạng dd/mm/yyyy" }); continue; }
    if (parsed.lastOrderAtRaw === null) { errors.push({ row: parsed.row, label, message: "Ngày ra đơn gần nhất không đúng định dạng dd/mm/yyyy" }); continue; }

    let assignedToId: string | null = null;
    if (status === "DA_PHAN_CONG" || status === "MAC_DINH") {
      if (!parsed.assignedToCode) { errors.push({ row: parsed.row, label, message: `Trạng thái "${parsed.statusText.trim()}" cần Mã NV phụ trách` }); continue; }
      const staffId = staffByCode.get(parsed.assignedToCode);
      if (!staffId) { errors.push({ row: parsed.row, label, message: `Mã NV phụ trách "${parsed.assignedToCode}" không tồn tại hoặc không phải NV bán hàng` }); continue; }
      assignedToId = staffId;
    }

    if (parsed.managerCode) {
      if (!assignedToId) {
        errors.push({ row: parsed.row, label, message: "Mã NV quản lý cần đi kèm Mã NV phụ trách (chỉ áp dụng khi Trạng thái Đã phân công/Mặc định)" });
        continue;
      }
      const managerId = staffByCode.get(parsed.managerCode);
      if (!managerId) { errors.push({ row: parsed.row, label, message: `Mã NV quản lý "${parsed.managerCode}" không tồn tại hoặc không phải NV bán hàng` }); continue; }
      const key = `${assignedToId}:${marketId}`;
      const claimed = managerAssignments.get(key);
      if (claimed && claimed.managerId !== managerId) {
        errors.push({
          row: parsed.row, label,
          message: `Mã NV quản lý cho NV phụ trách "${parsed.assignedToCode}" ở thị trường "${parsed.marketCode}" bị ghi khác nhau — dòng ${claimed.row} ghi "${claimed.managerCode}", dòng này ghi "${parsed.managerCode}"`,
        });
        continue;
      }
      if (!claimed) managerAssignments.set(key, { managerId, managerCode: parsed.managerCode, row: parsed.row });
    }

    let customerGroup: "KHACH_SI_NHO" | "KHACH_CONG_TY" | "KHACH_CONG_TY_LON" | null | undefined;
    if (parsed.customerGroupText.trim()) {
      const matched = CUSTOMER_GROUP_TEXT[parsed.customerGroupText.trim().toLowerCase()];
      if (!matched) {
        errors.push({ row: parsed.row, label, message: `Nhóm khách hàng phải là "Khách sỉ nhỏ", "Khách công ty" hoặc "Khách công ty lớn"` });
        continue;
      }
      customerGroup = matched;
    }

    // Để trống Ngày đầu tiếp cận: khách MỚI lấy hôm nay, khách ĐÃ CÓ (khớp Website) giữ nguyên ngày cũ.
    // Website rỗng không bao giờ khớp "đã có" — nhiều khách có thể cùng để trống Website, không coi là
    // cùng 1 khách (khác cách khớp bình thường theo websiteNormalized).
    const existing = websiteNormalized ? existingByWebsite.get(websiteNormalized) : undefined;
    const firstContactAt = parsed.firstContactAtRaw ?? (existing ? undefined : new Date());

    if (websiteNormalized) claimedWebsites.set(websiteNormalized, { row: parsed.row, label });
    validRows.push({
      row: parsed.row,
      label,
      name: parsed.name,
      website: parsed.website,
      websiteNormalized,
      nameNormalized: normalizeCustomerName(parsed.name),
      marketId,
      email: parsed.email || (existing ? undefined : null),
      phone: parsed.phone || (existing ? undefined : null),
      status,
      firstContactAt,
      lastOrderAt: parsed.lastOrderAtRaw ?? (existing ? undefined : null),
      lastOrderCode: parsed.lastOrderCode || (existing ? undefined : null),
      assignedToId,
      customerGroup: customerGroup ?? (existing ? undefined : null),
    });
  }

  let successCount = 0;
  if (validRows.length > 0 && errors.length === 0) {
    // File có thể vài trăm dòng, mỗi dòng TẠO MỚI tốn 2 round-trip (generateCustomerCode + create) —
    // timeout mặc định của Prisma interactive transaction (5s) không đủ, transaction bị huỷ giữa chừng
    // (rollback về 0 dòng) dù không báo lỗi rõ ràng cho NV. Nới lên 2 phút cho đủ dư với file lớn.
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        const existing = vr.websiteNormalized ? existingByWebsite.get(vr.websiteNormalized) : undefined;
        const baseData = {
          name: vr.name,
          nameNormalized: vr.nameNormalized,
          website: vr.website,
          websiteNormalized: vr.websiteNormalized,
          marketId: vr.marketId,
          status: vr.status,
          assignedToId: vr.assignedToId,
        };
        if (existing) {
          // Để trống 1 cột không bắt buộc trong file = GIỮ NGUYÊN giá trị cũ của khách đã có (chỉ ghi đè
          // đúng cột nào thật sự có dữ liệu trong dòng này) — tránh 1 lượt cập nhật chỉ đổi vài cột lại
          // vô tình xoá sạch email/SĐT/đơn hàng đã ghi nhận từ trước.
          await tx.customer.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              ...(vr.firstContactAt !== undefined ? { firstContactAt: vr.firstContactAt } : {}),
              ...(vr.email !== undefined ? { email: vr.email } : {}),
              ...(vr.phone !== undefined ? { phone: vr.phone } : {}),
              ...(vr.lastOrderAt !== undefined ? { lastOrderAt: vr.lastOrderAt } : {}),
              ...(vr.lastOrderCode !== undefined ? { lastOrderCode: vr.lastOrderCode } : {}),
              ...(vr.customerGroup !== undefined ? { customerGroup: vr.customerGroup } : {}),
            },
          });
        } else {
          const code = await generateCustomerCode(tx);
          await tx.customer.create({
            data: {
              ...baseData,
              code,
              firstContactAt: vr.firstContactAt!,
              email: vr.email ?? null,
              phone: vr.phone ?? null,
              lastOrderAt: vr.lastOrderAt ?? null,
              lastOrderCode: vr.lastOrderCode ?? null,
              customerGroup: vr.customerGroup ?? null,
            },
          });
        }
        successCount += 1;
      }

      for (const [key, { managerId }] of managerAssignments) {
        const [salesUserId, marketId] = key.split(":");
        await tx.salesManagerAssignment.upsert({
          where: { salesUserId_marketId: { salesUserId, marketId } },
          update: { managerId },
          create: { salesUserId, managerId, marketId },
        });
      }
    }, { timeout: 120_000 });
  }

  return NextResponse.json({ successCount, errors });
}
