import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll } from "@/types";
import ExcelJS from "exceljs";
import { cellText, cellNumber, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

type RowError = { row: number; label: string; message: string };

const SHEET_NAME = "Quy đổi sản lượng-KPI";

// Nhập hàng loạt đơn giá "Quy đổi sản lượng – KPI" (PlantTypeKpiRate) bằng Excel — thay cho việc sửa
// từng dòng ở tab cùng tên trong /payroll-settings. File mẫu điền sẵn toàn bộ mã cây đang hoạt động kèm
// đơn giá hiện tại, HCNS chỉ cần sửa cột Đơn giá rồi tải lên lại.
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { code: true, name: true, kpiRate: { select: { vndPerUnit: true } } },
    orderBy: { code: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [
    { header: "Mã cây", key: "code", width: 16 },
    { header: "Đơn giá (VNĐ/đơn vị)", key: "vndPerUnit", width: 22 },
    { header: "Tên cây (tham khảo)", key: "name", width: 32 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2]);
  sheet.addRow({ code: "MT001", vndPerUnit: 500, name: "Monstera Deliciosa" });
  styleExampleRow(sheet.getRow(2));
  for (const p of plantTypes) sheet.addRow({ code: p.code, vndPerUnit: p.kpiRate?.vndPerUnit ?? null, name: p.name });

  addGuideSheet(workbook, [
    { column: "Mã cây", required: true, description: "Mã cây đã có trong hệ thống (VD MT001). File mẫu đã điền sẵn mọi mã cây đang hoạt động." },
    { column: "Đơn giá (VNĐ/đơn vị)", required: true, description: "Số nguyên ≥ 0. Dòng để trống Đơn giá sẽ được bỏ qua (giữ nguyên đơn giá đang có)." },
    { column: "Tên cây (tham khảo)", required: false, description: "Chỉ để dễ đối chiếu, hệ thống không đọc cột này." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-quy-doi-san-luong-kpi.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

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

  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  const plantTypes = await prisma.plantType.findMany({ select: { id: true, code: true } });
  const plantTypeIdByCode = new Map(plantTypes.map((p) => [p.code.toUpperCase(), p.id]));

  const errors: RowError[] = [];
  const validRows: { plantTypeId: string; vndPerUnit: number }[] = [];
  const seenCodes = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const code = cellText(row.getCell(1).value).toUpperCase();
    const vndPerUnit = cellNumber(row.getCell(2).value);
    if (!code) {
      if (vndPerUnit !== undefined) errors.push({ row: rowNumber, label: "—", message: "Thiếu Mã cây" });
      return;
    }
    if (vndPerUnit === undefined) return; // để trống đơn giá = giữ nguyên
    if (seenCodes.has(code)) {
      errors.push({ row: rowNumber, label: code, message: "Mã cây trùng với 1 dòng khác trong file" });
      return;
    }
    seenCodes.add(code);
    const plantTypeId = plantTypeIdByCode.get(code);
    if (!plantTypeId) {
      errors.push({ row: rowNumber, label: code, message: `Không tìm thấy mã cây "${code}" trong hệ thống` });
      return;
    }
    if (!Number.isInteger(vndPerUnit) || vndPerUnit < 0) {
      errors.push({ row: rowNumber, label: code, message: "Đơn giá phải là số nguyên ≥ 0" });
      return;
    }
    validRows.push({ plantTypeId, vndPerUnit });
  });

  if (validRows.length === 0 && errors.length === 0) {
    return NextResponse.json({ message: "File không có dòng nào có Đơn giá" }, { status: 400 });
  }

  // Chỉ ghi khi cả file không còn dòng lỗi nào — tránh nửa vời khi HCNS sửa lỗi rồi tải lại.
  let successCount = 0;
  if (errors.length === 0) {
    await prisma.$transaction(
      validRows.map((r) =>
        prisma.plantTypeKpiRate.upsert({
          where: { plantTypeId: r.plantTypeId },
          update: { vndPerUnit: r.vndPerUnit },
          create: { plantTypeId: r.plantTypeId, vndPerUnit: r.vndPerUnit },
        })
      )
    );
    successCount = validRows.length;
  }

  return NextResponse.json({ successCount, errors });
}
