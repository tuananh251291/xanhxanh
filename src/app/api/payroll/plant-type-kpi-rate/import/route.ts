import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManagePayroll, KPI_RATE_STAGE_CODES } from "@/types";
import ExcelJS from "exceljs";
import { cellText, cellNumber, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

type RowError = { row: number; label: string; message: string };

const SHEET_NAME = "Quy đổi sản lượng-KPI";
const STAGE_CODE_LIST = KPI_RATE_STAGE_CODES.join(", ");

// Nhập hàng loạt đơn giá "Quy đổi sản lượng – KPI" (PlantTypeKpiRate) theo (mã cây + quy cách) bằng
// Excel. File tải lên THAY THẾ TOÀN BỘ bảng đơn giá: combo có đơn giá khác hiện tại thì ghi đè, combo mới
// thì thêm, combo giống hệt thì giữ nguyên, combo đang có đơn giá mà không có trong file (hoặc để trống
// Đơn giá) thì xoá. File mẫu điền sẵn mọi mã cây đang hoạt động × quy cách kèm đơn giá hiện tại.
export async function GET() {
  const session = await auth();
  if (!canManagePayroll(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const plantTypes = await prisma.plantType.findMany({
    where: { isActive: true },
    select: { code: true, name: true, kpiRates: { select: { stageCode: true, vndPerUnit: true } } },
    orderBy: { code: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [
    { header: "Mã cây", key: "code", width: 16 },
    { header: "Quy cách", key: "stageCode", width: 12 },
    { header: "Đơn giá (VNĐ/cây hoặc cụm)", key: "vndPerUnit", width: 26 },
    { header: "Tên cây (tham khảo)", key: "name", width: 32 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2]);
  sheet.addRow({ code: "MT001", stageCode: "T01", vndPerUnit: 500, name: "Monstera Deliciosa" });
  styleExampleRow(sheet.getRow(2));
  for (const p of plantTypes) {
    for (const stageCode of KPI_RATE_STAGE_CODES) {
      const rate = p.kpiRates.find((r) => r.stageCode === stageCode);
      sheet.addRow({ code: p.code, stageCode, vndPerUnit: rate?.vndPerUnit ?? null, name: p.name });
    }
  }

  addGuideSheet(workbook, [
    { column: "Mã cây", required: true, description: "Mã cây đã có trong hệ thống (VD MT001). File mẫu đã điền sẵn mọi mã cây đang hoạt động." },
    { column: "Quy cách", required: true, description: `Một trong: ${STAGE_CODE_LIST}. Mỗi cặp Mã cây + Quy cách chỉ được xuất hiện 1 lần trong file.` },
    {
      column: "Đơn giá (VNĐ/cây hoặc cụm)",
      required: false,
      description: "Số nguyên ≥ 0 — VNĐ/cây với T01/T05, VNĐ/cụm với M05. Để trống = KHÔNG có đơn giá (quy đổi 0đ), xoá đơn giá đang có.",
    },
    { column: "Tên cây (tham khảo)", required: false, description: "Chỉ để dễ đối chiếu, hệ thống không đọc cột này." },
    {
      column: "THAY THẾ TOÀN BỘ",
      required: false,
      description:
        "File tải lên thay thế toàn bộ bảng đơn giá hiện tại: đơn giá khác sẽ được ghi đè, giống thì giữ nguyên, cặp Mã cây + Quy cách KHÔNG có trong file sẽ bị xoá đơn giá. Nên tải file mẫu mới nhất rồi sửa trên đó.",
    },
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

  const [plantTypes, existingRates] = await Promise.all([
    prisma.plantType.findMany({ select: { id: true, code: true } }),
    prisma.plantTypeKpiRate.findMany({ select: { id: true, plantTypeId: true, stageCode: true, vndPerUnit: true } }),
  ]);
  const plantTypeIdByCode = new Map(plantTypes.map((p) => [p.code.toUpperCase(), p.id]));
  const validStageCodes = new Set<string>(KPI_RATE_STAGE_CODES);

  const errors: RowError[] = [];
  // key `${plantTypeId}|${stageCode}` -> đơn giá trong file (null = để trống, xoá đơn giá)
  const fileRates = new Map<string, { plantTypeId: string; stageCode: string; vndPerUnit: number | null }>();
  const firstRowByCombo = new Map<string, number>();
  let dataRowCount = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const code = cellText(row.getCell(1).value).toUpperCase();
    const stageCode = cellText(row.getCell(2).value).toUpperCase();
    const priceText = cellText(row.getCell(3).value);
    if (!code && !stageCode && !priceText) return; // dòng trống hoàn toàn
    dataRowCount += 1;
    const label = `${code || "—"} ${stageCode || "—"}`;

    if (!code) { errors.push({ row: rowNumber, label, message: "Thiếu Mã cây" }); return; }
    if (!stageCode) { errors.push({ row: rowNumber, label, message: "Thiếu Quy cách" }); return; }
    if (!validStageCodes.has(stageCode)) {
      errors.push({ row: rowNumber, label, message: `Quy cách "${stageCode}" không hợp lệ — chỉ nhận ${STAGE_CODE_LIST}` });
      return;
    }
    const comboLabel = `${code}|${stageCode}`;
    const firstRow = firstRowByCombo.get(comboLabel);
    if (firstRow !== undefined) {
      errors.push({ row: rowNumber, label, message: `Trùng Mã cây + Quy cách với dòng ${firstRow}` });
      return;
    }
    firstRowByCombo.set(comboLabel, rowNumber);

    const plantTypeId = plantTypeIdByCode.get(code);
    if (!plantTypeId) { errors.push({ row: rowNumber, label, message: `Không tìm thấy mã cây "${code}" trong hệ thống` }); return; }

    const vndPerUnit = cellNumber(row.getCell(3).value);
    if (vndPerUnit !== undefined && (!Number.isInteger(vndPerUnit) || vndPerUnit < 0)) {
      errors.push({ row: rowNumber, label, message: `Đơn giá "${priceText}" không hợp lệ — phải là số nguyên ≥ 0` });
      return;
    }
    fileRates.set(`${plantTypeId}|${stageCode}`, { plantTypeId, stageCode, vndPerUnit: vndPerUnit ?? null });
  });

  if (dataRowCount === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  // File có lỗi (trùng, sai định dạng...) = KHÔNG ghi gì — HCNS sửa hết rồi tải lại.
  if (errors.length > 0) return NextResponse.json({ successCount: 0, errors });

  const existingByKey = new Map(existingRates.map((r) => [`${r.plantTypeId}|${r.stageCode}`, r]));
  const toCreate: { plantTypeId: string; stageCode: string; vndPerUnit: number }[] = [];
  const toUpdate: { id: string; vndPerUnit: number }[] = [];
  const toDeleteIds: string[] = [];
  for (const [key, r] of fileRates) {
    const existing = existingByKey.get(key);
    if (r.vndPerUnit == null) {
      if (existing) toDeleteIds.push(existing.id);
    } else if (!existing) {
      toCreate.push({ plantTypeId: r.plantTypeId, stageCode: r.stageCode, vndPerUnit: r.vndPerUnit });
    } else if (existing.vndPerUnit !== r.vndPerUnit) {
      toUpdate.push({ id: existing.id, vndPerUnit: r.vndPerUnit });
    }
  }
  for (const [key, existing] of existingByKey) {
    if (!fileRates.has(key)) toDeleteIds.push(existing.id);
  }

  await prisma.$transaction([
    ...(toCreate.length > 0 ? [prisma.plantTypeKpiRate.createMany({ data: toCreate })] : []),
    ...toUpdate.map((u) => prisma.plantTypeKpiRate.update({ where: { id: u.id }, data: { vndPerUnit: u.vndPerUnit } })),
    ...(toDeleteIds.length > 0 ? [prisma.plantTypeKpiRate.deleteMany({ where: { id: { in: toDeleteIds } } })] : []),
  ]);

  const changed = toCreate.length + toUpdate.length + toDeleteIds.length;
  const summary = changed === 0
    ? "File giống hệt số liệu hiện tại — không có gì thay đổi"
    : `Đã cập nhật: ${toUpdate.length} đơn giá thay đổi, ${toCreate.length} đơn giá mới, ${toDeleteIds.length} đơn giá bị xoá`;
  return NextResponse.json({ successCount: changed, errors, summary });
}
