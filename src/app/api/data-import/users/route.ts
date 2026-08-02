import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { cellText, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { ROLE_LABELS, type UserRole } from "@/types";

type RowError = { row: number; label: string; message: string };

// Mật khẩu mặc định khi cột "Mật khẩu" để trống — NV tự đổi sau lần đăng nhập đầu (chưa có màn hình
// bắt buộc đổi mật khẩu, chỉ ghi rõ trong sheet "Danh mục" của file mẫu để Admin cấp cao thông báo lại).
const DEFAULT_PASSWORD = "XanhXanh@2026";

const LABEL_TO_ROLE = new Map<string, UserRole>(
  (Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => [label.toLowerCase(), role])
);

function resolveRole(text: string): UserRole | null {
  if (text in ROLE_LABELS) return text as UserRole;
  return LABEL_TO_ROLE.get(text.toLowerCase()) ?? null;
}

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel người dùng" }, { status: 403 });
  }

  const warehouses = await prisma.warehouse.findMany({
    where: { isActive: true, type: "SAN_XUAT" },
    select: { code: true, name: true },
    orderBy: { code: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Người dùng");
  sheet.columns = [
    { header: "Mã NV", key: "code", width: 12 },
    { header: "Họ tên", key: "name", width: 22 },
    { header: "Email", key: "email", width: 26 },
    { header: "Mật khẩu", key: "password", width: 16 },
    { header: "Vai trò", key: "role", width: 20 },
    { header: "Mã kho làm việc", key: "warehouseCode", width: 16 },
    { header: "Sức chứa cấy (chỉ NV Cấy mô)", key: "capacity", width: 22 },
    { header: "Luồng kiểm tra (chỉ NV Cấy mô)", key: "lane", width: 22 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3, 5]);
  sheet.addRow({ code: "NVCM010", name: "Nguyễn Văn A", email: "nva@vidu.vn", password: "", role: "NV Cấy mô", warehouseCode: "SX-A", capacity: 1920, lane: "Xanh" });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 16 },
    { header: "Mã/Giá trị", key: "code", width: 20 },
    { header: "Tên", key: "name", width: 30 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const [role, label] of Object.entries(ROLE_LABELS)) {
    if (role === "SUPER_ADMIN") continue;
    helpSheet.addRow({ type: "Vai trò", code: label, name: role });
  }
  for (const w of warehouses) helpSheet.addRow({ type: "Kho làm việc", code: w.code, name: w.name });
  helpSheet.addRow({ type: "Luồng kiểm tra", code: "Xanh", name: "" });
  helpSheet.addRow({ type: "Luồng kiểm tra", code: "Đỏ", name: "" });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM người dùng mới — không xoá/sửa tài khoản đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: `Để trống cột Mật khẩu = mật khẩu mặc định "${DEFAULT_PASSWORD}".` });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã kho làm việc chỉ áp dụng vai trò NV Kho, NV Cấy mô, NV Môi trường." });

  addGuideSheet(workbook, [
    { column: "Mã NV", required: true, description: "Mã nhân viên, gõ tự do, phải chưa tồn tại trong hệ thống (VD: NVCM010)." },
    { column: "Họ tên", required: true, description: "Họ và tên đầy đủ." },
    { column: "Email", required: true, description: "Đúng định dạng email, chưa tồn tại trong hệ thống." },
    { column: "Mật khẩu", required: false, description: `Để trống = dùng mật khẩu mặc định "${DEFAULT_PASSWORD}".` },
    { column: "Vai trò", required: true, description: "Tên vai trò tiếng Việt, xem danh sách ở sheet Danh mục (VD: NV Cấy mô)." },
    { column: "Mã kho làm việc", required: false, description: "Chỉ áp dụng vai trò NV Kho/NV Cấy mô/NV Môi trường — mã kho sản xuất, xem sheet Danh mục." },
    { column: "Sức chứa cấy (chỉ NV Cấy mô)", required: false, description: "Số cây tối đa NV cấy được/tuần — chỉ có ý nghĩa với vai trò NV Cấy mô." },
    { column: "Luồng kiểm tra (chỉ NV Cấy mô)", required: false, description: `"Xanh" hoặc "Đỏ" — chỉ có ý nghĩa với vai trò NV Cấy mô.` },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-nguoi-dung.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel người dùng" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Người dùng") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    code: string;
    name: string;
    email: string;
    password: string;
    roleText: string;
    warehouseCode?: string;
    capacity?: string;
    lane?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const code = cellText(row.getCell(1).value);
    if (!code) return;
    parsedRows.push({
      row: rowNumber,
      code,
      name: cellText(row.getCell(2).value),
      email: cellText(row.getCell(3).value),
      password: cellText(row.getCell(4).value),
      roleText: cellText(row.getCell(5).value),
      warehouseCode: cellText(row.getCell(6).value) || undefined,
      capacity: cellText(row.getCell(7).value) || undefined,
      lane: cellText(row.getCell(8).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const workplaceWarehouseRoles = new Set<UserRole>(["KHO_MO", "CAY_MO", "MOI_TRUONG"]);

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  type ValidRow = {
    row: number;
    code: string;
    name: string;
    email: string;
    password: string;
    role: UserRole;
    workplaceWarehouseId?: string;
    plantingCapacity?: number;
    inspectionLane?: "XANH" | "DO";
  };
  const validRows: ValidRow[] = [];
  const claimedCodes = new Set<string>();
  const claimedEmails = new Set<string>();

  for (const parsed of parsedRows) {
    if (!parsed.name) {
      errors.push({ row: parsed.row, label: parsed.code, message: "Thiếu Họ tên" });
      continue;
    }
    if (!parsed.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email)) {
      errors.push({ row: parsed.row, label: parsed.code, message: "Email không hợp lệ" });
      continue;
    }
    const role = resolveRole(parsed.roleText);
    if (!role || role === "SUPER_ADMIN") {
      errors.push({ row: parsed.row, label: parsed.code, message: `Không nhận diện được Vai trò "${parsed.roleText}"` });
      continue;
    }

    const codeKey = parsed.code.toLowerCase();
    const emailKey = parsed.email.toLowerCase();
    if (claimedCodes.has(codeKey)) {
      errors.push({ row: parsed.row, label: parsed.code, message: "Mã NV trùng với 1 dòng khác trong file" });
      continue;
    }
    if (claimedEmails.has(emailKey)) {
      errors.push({ row: parsed.row, label: parsed.code, message: "Email trùng với 1 dòng khác trong file" });
      continue;
    }
    const existing = await prisma.user.findFirst({
      where: { OR: [{ code: parsed.code }, { email: parsed.email }] },
      select: { code: true, email: true },
    });
    if (existing) {
      const dup = existing.code === parsed.code ? "Mã NV" : "Email";
      errors.push({ row: parsed.row, label: parsed.code, message: `${dup} đã tồn tại trong hệ thống` });
      continue;
    }

    let workplaceWarehouseId: string | undefined;
    if (workplaceWarehouseRoles.has(role) && parsed.warehouseCode) {
      const wh = await prisma.warehouse.findUnique({ where: { code: parsed.warehouseCode }, select: { id: true } });
      if (!wh) {
        errors.push({ row: parsed.row, label: parsed.code, message: `Không tìm thấy Mã kho "${parsed.warehouseCode}"` });
        continue;
      }
      workplaceWarehouseId = wh.id;
    }

    let plantingCapacity: number | undefined;
    if (role === "CAY_MO" && parsed.capacity) {
      const n = Number(parsed.capacity);
      if (!Number.isFinite(n) || n <= 0) {
        errors.push({ row: parsed.row, label: parsed.code, message: "Sức chứa cấy phải là số dương" });
        continue;
      }
      plantingCapacity = Math.round(n);
    }

    let inspectionLane: "XANH" | "DO" | undefined;
    if (role === "CAY_MO" && parsed.lane) {
      const laneText = parsed.lane.toLowerCase();
      if (laneText === "xanh") inspectionLane = "XANH";
      else if (laneText === "đỏ" || laneText === "do") inspectionLane = "DO";
      else {
        errors.push({ row: parsed.row, label: parsed.code, message: `Luồng kiểm tra "${parsed.lane}" không hợp lệ (Xanh/Đỏ)` });
        continue;
      }
    }

    claimedCodes.add(codeKey);
    claimedEmails.add(emailKey);
    validRows.push({
      row: parsed.row,
      code: parsed.code,
      name: parsed.name,
      email: parsed.email,
      password: parsed.password || DEFAULT_PASSWORD,
      role,
      workplaceWarehouseId,
      plantingCapacity,
      inspectionLane,
    });
  }

  // ---- Giai đoạn 2: tạo hàng loạt trong 1 transaction — CHỈ khi cả file không còn dòng lỗi nào (tất cả
  // hoặc không gì cả), tránh nửa vời: NV vừa sửa xong vài dòng lỗi rồi tải lại thì không bị tạo trùng
  // các dòng đã lỡ tạo ở lần tải trước.
  let successCount = 0;
  if (validRows.length > 0 && errors.length === 0) {
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        const hashed = await bcrypt.hash(vr.password, 10);
        await tx.user.create({
          data: {
            code: vr.code,
            name: vr.name,
            email: vr.email,
            password: hashed,
            role: vr.role,
            status: "APPROVED",
            isActive: true,
            workplaceWarehouseId: vr.workplaceWarehouseId,
            plantingCapacity: vr.plantingCapacity,
            inspectionLane: vr.inspectionLane,
          },
        });
        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
