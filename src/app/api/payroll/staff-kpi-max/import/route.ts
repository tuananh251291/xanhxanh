import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import ExcelJS from "exceljs";
import { cellText, cellNumber, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

type RowError = { row: number; label: string; message: string };

// 2 loại mức tối đa riêng từng NV cấy mô (đều nằm trên StaffBaseSalary), chọn qua ?kind=:
// - compliance (mặc định): "Mức thưởng KPI tuân thủ tối đa" (kpiBonusAmount) — để trống = dùng mức chung theo kỳ.
// - work: "Mức KPI công việc tối đa" (workKpiMaxAmount) — để trống = chưa cài (tính như 0).
const KINDS = {
  compliance: { field: "kpiBonusAmount", sheet: "Mức thưởng KPI theo NV", column: "Mức thưởng KPI tối đa (VNĐ)", file: "mau-muc-thuong-kpi-theo-nv.xlsx", blank: "dùng mức chung theo kỳ (tab Mức thưởng KPI)", label: "mức thưởng KPI" },
  work: { field: "workKpiMaxAmount", sheet: "Mức KPI công việc theo NV", column: "Mức KPI công việc tối đa (VNĐ/tháng)", file: "mau-muc-kpi-cong-viec-theo-nv.xlsx", blank: "chưa cài mức KPI công việc (tính như 0)", label: "mức KPI công việc" },
} as const;
type Kind = keyof typeof KINDS;
const kindOf = (req: NextRequest): Kind => (req.nextUrl.searchParams.get("kind") === "work" ? "work" : "compliance");

// Nhập hàng loạt mức tối đa RIÊNG từng NV cấy mô bằng Excel. File mẫu điền sẵn mọi NV cấy mô đang hoạt động
// kèm mức đang cài. Chỉ NV có dòng trong file mới bị cập nhật: có số = mức mới, để trống = bỏ mức riêng;
// NV không có trong file giữ nguyên. File có bất kỳ dòng lỗi nào = không ghi gì.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const K = KINDS[kindOf(req)];

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true },
    select: { code: true, name: true, workplaceWarehouse: { select: { name: true } }, staffBaseSalary: { select: { kpiBonusAmount: true, workKpiMaxAmount: true } } },
    orderBy: [{ workplaceWarehouse: { name: "asc" } }, { code: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(K.sheet);
  sheet.columns = [
    { header: "Mã NV", key: "code", width: 14 },
    { header: K.column, key: "amount", width: 32 },
    { header: "Tên NV (tham khảo)", key: "name", width: 28 },
    { header: "Cơ sở (tham khảo)", key: "warehouse", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1]);
  sheet.addRow({ code: "NVCM001", amount: 1000000, name: "Nguyễn Văn A", warehouse: "Kho sản xuất Bát Tràng" });
  styleExampleRow(sheet.getRow(2));
  for (const s of staffList) {
    sheet.addRow({ code: s.code, amount: s.staffBaseSalary?.[K.field] ?? null, name: s.name, warehouse: s.workplaceWarehouse?.name ?? "" });
  }
  sheet.getColumn(2).numFmt = "#,##0";

  addGuideSheet(workbook, [
    { column: "Mã NV", required: true, description: "Mã NV cấy mô đang hoạt động. File mẫu đã điền sẵn mọi NV cấy mô. Mỗi Mã NV chỉ được xuất hiện 1 lần." },
    { column: K.column, required: false, description: `Số nguyên ≥ 0 — ${K.label} tối đa riêng của NV. Để trống = ${K.blank}.` },
    { column: "Tên NV / Cơ sở (tham khảo)", required: false, description: "Chỉ để dễ đối chiếu, hệ thống không đọc 2 cột này." },
    { column: "NV không có trong file", required: false, description: "Giữ nguyên mức đang cài, không bị đụng tới." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${K.file}"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const K = KINDS[kindOf(req)];

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  const sheet = workbook.getWorksheet(K.sheet) ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  const staffList = await prisma.user.findMany({
    where: { role: "CAY_MO" },
    select: { id: true, code: true, isActive: true, staffBaseSalary: { select: { id: true, kpiBonusAmount: true, workKpiMaxAmount: true } } },
  });
  const staffByCode = new Map(staffList.map((s) => [s.code.toUpperCase(), s]));

  const errors: RowError[] = [];
  const planned: { staff: (typeof staffList)[number]; amount: number | null }[] = [];
  const firstRowByCode = new Map<string, number>();
  let dataRowCount = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const code = cellText(row.getCell(1).value).toUpperCase();
    const amountText = cellText(row.getCell(2).value);
    if (!code && !amountText) return;
    dataRowCount += 1;
    const label = code || "—";
    if (!code) { errors.push({ row: rowNumber, label, message: "Thiếu Mã NV" }); return; }
    const first = firstRowByCode.get(code);
    if (first !== undefined) { errors.push({ row: rowNumber, label, message: `Trùng Mã NV với dòng ${first}` }); return; }
    firstRowByCode.set(code, rowNumber);
    const staff = staffByCode.get(code);
    if (!staff) { errors.push({ row: rowNumber, label, message: `Không tìm thấy NV cấy mô có mã "${code}"` }); return; }
    if (!staff.isActive) { errors.push({ row: rowNumber, label, message: `NV ${code} đã ngừng hoạt động` }); return; }
    const amount = cellNumber(row.getCell(2).value);
    if (amount !== undefined && (!Number.isInteger(amount) || amount < 0)) {
      errors.push({ row: rowNumber, label, message: `Mức "${amountText}" không hợp lệ — phải là số nguyên ≥ 0` });
      return;
    }
    planned.push({ staff, amount: amount ?? null });
  });

  if (dataRowCount === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  if (errors.length > 0) return NextResponse.json({ successCount: 0, errors });

  // Chỉ ghi dòng có thay đổi — NV đã có bản ghi lương thì cập nhật gộp 1 lệnh, NV chưa có thì tạo mới
  // (Lương công việc mặc định 0, sửa sau ở tab Lương công việc — giống PATCH /api/payroll/staff-base-salary).
  const changed = planned.filter((p) => (p.staff.staffBaseSalary?.[K.field] ?? null) !== p.amount);
  const toUpdate = changed.filter((p) => p.staff.staffBaseSalary);
  const toCreate = changed.filter((p) => !p.staff.staffBaseSalary && p.amount !== null);
  await prisma.$transaction([
    ...(toCreate.length
      ? [prisma.staffBaseSalary.createMany({ data: toCreate.map((p) => ({ staffId: p.staff.id, monthlyAmount: 0, [K.field]: p.amount })) })]
      : []),
    ...(toUpdate.length
      ? [prisma.$executeRaw`UPDATE staff_base_salaries AS s SET ${Prisma.raw(`"${K.field}"`)} = v.a, "updatedAt" = now()
          FROM (VALUES ${Prisma.join(toUpdate.map((p) => Prisma.sql`(${p.staff.staffBaseSalary!.id}, ${p.amount}::int)`))}) AS v(id, a)
          WHERE s.id = v.id`]
      : []),
  ]);

  const setCount = changed.filter((p) => p.amount !== null).length;
  const clearedCount = changed.length - setCount;
  const summary = changed.length === 0
    ? "File giống hệt số liệu hiện tại — không có gì thay đổi"
    : `Đã cập nhật ${K.label}: ${setCount} NV có mức mới${clearedCount ? `, ${clearedCount} NV bỏ mức riêng (${K.blank})` : ""}`;
  return NextResponse.json({ successCount: changed.length, errors, summary });
}
