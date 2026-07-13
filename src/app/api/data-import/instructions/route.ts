import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { generateInstructionCode } from "@/lib/codes";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { INSTRUCTION_STATUS_LABELS } from "@/types";

type RowError = { row: number; label: string; message: string };

const STATUS_LABEL_TO_ENUM = new Map<string, "DRAFT" | "ACTIVE">([
  [INSTRUCTION_STATUS_LABELS.DRAFT.toLowerCase(), "DRAFT"],
  [INSTRUCTION_STATUS_LABELS.ACTIVE.toLowerCase(), "ACTIVE"],
]);

// Nhập hàng loạt CHỈ ĐỊNH CẤY đang thực hiện dở ngoài đời (đơn giản hoá: 1 dòng Excel = 1 chỉ định
// chỉ có 1 quy cách nguồn duy nhất — chỉ định phức tạp hơn nhiều kệ/quy cách vẫn tạo tay qua UI hiện
// có). KHÔNG tự tạo/gộp MediumOrder hay bắn alert MEDIUM_ORDER_CREATED như luồng thủ công — đây là dữ
// liệu backfill phản ánh việc đã/đang xảy ra, không phải việc mới cần NV môi trường xử lý.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel chỉ định cấy" }, { status: 403 });
  }

  const [plantTypes, mediumTypes, staff, shelves] = await Promise.all([
    prisma.plantType.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.mediumType.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.shelf.findMany({
      where: { isActive: true, room: { type: "PHONG_MAU_ME" }, warehouse: { type: "SAN_XUAT" } },
      select: { code: true, lots: { where: { status: "ACTIVE" }, select: { code: true, stageCode: true } } },
      orderBy: { code: "asc" },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Chỉ định cấy");
  sheet.columns = [
    { header: "Mã chỉ định (để trống = tự sinh)", key: "code", width: 22 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Mã kệ nguồn", key: "shelfCode", width: 20 },
    { header: "Mã lô nguồn", key: "lotCode", width: 18 },
    { header: "Quy cách nguồn (M03/M05)", key: "stageCode", width: 18 },
    { header: "Số lượng dùng", key: "quantity", width: 14 },
    { header: "Tỉ lệ nhân mẫu mẹ", key: "motherSampleRatio", width: 16 },
    { header: "Tỉ lệ ra rễ", key: "rootingRatio", width: 12 },
    { header: "Mã môi trường nhân mẫu mẹ", key: "motherMediumCode", width: 22 },
    { header: "Mã môi trường ra rễ", key: "finishedMediumCode", width: 18 },
    { header: "Mã NV cấy mô phụ trách", key: "staffCode", width: 18 },
    { header: "Tuần thực hiện", key: "weekStart", width: 14 },
    { header: "Trạng thái (Nháp/Đang thực hiện)", key: "status", width: 20 },
    { header: "Kế hoạch túi T01", key: "plannedT01", width: 14 },
    { header: "Kế hoạch túi T05", key: "plannedT05", width: 14 },
    { header: "Ghi chú", key: "notes", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  sheet.addRow({
    plantTypeCode: plantTypes[0]?.code ?? "MT001",
    shelfCode: shelves[0]?.code ?? "SX-A-PS-A01C01",
    lotCode: shelves[0]?.lots[0]?.code ?? "MT001010726",
    stageCode: shelves[0]?.lots[0]?.stageCode ?? "M03",
    quantity: 100,
    motherSampleRatio: 5,
    rootingRatio: 3,
    motherMediumCode: mediumTypes[0]?.code ?? "MT-A",
    finishedMediumCode: mediumTypes[0]?.code ?? "MT-A",
    staffCode: staff[0]?.code ?? "NVCM010",
    weekStart: "01/07/2026",
    status: INSTRUCTION_STATUS_LABELS.ACTIVE,
    plannedT01: 50,
    plannedT05: 50,
  });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 18 },
    { header: "Mã", key: "code", width: 16 },
    { header: "Tên", key: "name", width: 30 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const p of plantTypes) helpSheet.addRow({ type: "Mã cây", code: p.code, name: p.name });
  for (const m of mediumTypes) helpSheet.addRow({ type: "Mã môi trường", code: m.code, name: m.name });
  for (const s of staff) helpSheet.addRow({ type: "Mã NV cấy mô", code: s.code, name: s.name });
  for (const s of shelves) {
    for (const lot of s.lots) helpSheet.addRow({ type: "Kệ → Lô ACTIVE", code: s.code, name: `${lot.code} (${lot.stageCode})` });
  }
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM chỉ định cấy mới — không xoá/sửa chỉ định đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã NV cấy mô phụ trách: bỏ trống nếu kệ nguồn đã \"chia\" sẵn cho 1 NV (hệ thống tự gán)." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã lô nguồn phải là lô đang hoạt động (ACTIVE) trên đúng kệ nguồn — nhập ở mục \"Lô tồn kho hiện có\" trước nếu chưa có." });

  addGuideSheet(workbook, [
    { column: "Mã chỉ định (để trống = tự sinh)", required: false, description: "Để trống để hệ thống tự sinh mã theo quy tắc chuẩn." },
    { column: "Mã cây", required: true, description: "Mã loại cây, xem sheet Danh mục." },
    { column: "Mã kệ nguồn", required: true, description: "Kệ trong Phòng mẫu mẹ của Kho sản xuất, xem sheet Danh mục." },
    { column: "Mã lô nguồn", required: true, description: "Lô đang ACTIVE trên đúng kệ nguồn — nhập ở mục \"Lô tồn kho hiện có\" trước nếu chưa có." },
    { column: "Quy cách nguồn (M03/M05)", required: true, description: "Đúng M03 hoặc M05." },
    { column: "Số lượng dùng", required: true, description: "Số nguyên dương — số mẫu mẹ lấy từ lô nguồn để cấy." },
    { column: "Tỉ lệ nhân mẫu mẹ", required: true, description: "Số dương — dùng tính sản lượng mẫu mẹ dự kiến (Số lượng dùng × tỉ lệ)." },
    { column: "Tỉ lệ ra rễ", required: true, description: "Số dương — dùng tính sản lượng thành phẩm dự kiến (Số lượng dùng × tỉ lệ)." },
    { column: "Mã môi trường nhân mẫu mẹ", required: true, description: "Mã môi trường dùng để nhân mẫu mẹ, xem sheet Danh mục." },
    { column: "Mã môi trường ra rễ", required: true, description: "Mã môi trường dùng để ra rễ thành phẩm, xem sheet Danh mục." },
    { column: "Mã NV cấy mô phụ trách", required: false, description: "Bỏ trống nếu kệ nguồn đã \"chia\" sẵn cho 1 NV (hệ thống tự gán)." },
    { column: "Tuần thực hiện", required: true, description: "Định dạng dd/mm/yyyy — ngày bất kỳ trong tuần thực hiện." },
    { column: "Trạng thái (Nháp/Đang thực hiện)", required: false, description: "Để trống = mặc định \"Đang thực hiện\"." },
    { column: "Kế hoạch túi T01", required: false, description: "Số nguyên không âm. Để trống = 0." },
    { column: "Kế hoạch túi T05", required: false, description: "Số nguyên không âm. Để trống = 0." },
    { column: "Ghi chú", required: false, description: "Ghi chú tự do." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-chi-dinh-cay.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel chỉ định cấy" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Chỉ định cấy") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    code?: string;
    plantTypeCode: string;
    shelfCode: string;
    lotCode: string;
    stageCode: string;
    quantity?: string;
    motherSampleRatio?: string;
    rootingRatio?: string;
    motherMediumCode: string;
    finishedMediumCode: string;
    staffCode?: string;
    weekStartRaw: ExcelJS.CellValue;
    status?: string;
    plannedT01?: string;
    plannedT05?: string;
    notes?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const shelfCode = cellText(row.getCell(3).value);
    if (!shelfCode) return;
    parsedRows.push({
      row: rowNumber,
      code: cellText(row.getCell(1).value) || undefined,
      plantTypeCode: cellText(row.getCell(2).value),
      shelfCode,
      lotCode: cellText(row.getCell(4).value),
      stageCode: cellText(row.getCell(5).value),
      quantity: cellText(row.getCell(6).value) || undefined,
      motherSampleRatio: cellText(row.getCell(7).value) || undefined,
      rootingRatio: cellText(row.getCell(8).value) || undefined,
      motherMediumCode: cellText(row.getCell(9).value),
      finishedMediumCode: cellText(row.getCell(10).value),
      staffCode: cellText(row.getCell(11).value) || undefined,
      weekStartRaw: row.getCell(12).value,
      status: cellText(row.getCell(13).value) || undefined,
      plannedT01: cellText(row.getCell(14).value) || undefined,
      plannedT05: cellText(row.getCell(15).value) || undefined,
      notes: cellText(row.getCell(16).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  type ValidRow = {
    row: number;
    codeOverride?: string;
    plantTypeId: string;
    shelfId: string;
    shelfCode: string;
    warehouseCode: string;
    lotId: string;
    stageCode: string;
    quantity: number;
    motherSampleRatio: number;
    rootingRatio: number;
    expectedMotherOutput: number;
    expectedFinishedOutput: number;
    motherMediumTypeId: string;
    finishedMediumTypeId: string;
    assignedToId?: string;
    weekStart?: Date;
    status: "DRAFT" | "ACTIVE";
    plannedT01Quantity: number;
    plannedT05Quantity: number;
    notes?: string;
  };

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedCodes = new Set<string>();

  for (const parsed of parsedRows) {
    const plantType = parsed.plantTypeCode
      ? await prisma.plantType.findUnique({ where: { code: parsed.plantTypeCode }, select: { id: true } })
      : null;
    if (!plantType) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Không tìm thấy mã cây "${parsed.plantTypeCode}"` });
      continue;
    }

    const shelf = await prisma.shelf.findFirst({
      where: { code: parsed.shelfCode, room: { type: "PHONG_MAU_ME" }, warehouse: { type: "SAN_XUAT" } },
      select: { id: true, code: true, assignedStaffId: true, warehouse: { select: { code: true } } },
    });
    if (!shelf) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: "Chỉ được chọn kệ trong Phòng mẫu mẹ của Kho sản xuất" });
      continue;
    }

    if (parsed.stageCode !== "M03" && parsed.stageCode !== "M05") {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Quy cách nguồn "${parsed.stageCode}" không hợp lệ (M03/M05)` });
      continue;
    }
    const lot = await prisma.lot.findFirst({
      where: { code: parsed.lotCode, stageCode: parsed.stageCode, shelfId: shelf.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!lot) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Không tìm thấy lô ACTIVE "${parsed.lotCode}" (${parsed.stageCode}) trên kệ này` });
      continue;
    }

    const quantity = Number(parsed.quantity);
    if (!parsed.quantity || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: "Số lượng dùng phải là số nguyên dương" });
      continue;
    }
    const motherSampleRatio = Number(parsed.motherSampleRatio);
    if (!parsed.motherSampleRatio || !Number.isFinite(motherSampleRatio) || motherSampleRatio <= 0) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: "Tỉ lệ nhân mẫu mẹ phải là số dương" });
      continue;
    }
    const rootingRatio = Number(parsed.rootingRatio);
    if (!parsed.rootingRatio || !Number.isFinite(rootingRatio) || rootingRatio <= 0) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: "Tỉ lệ ra rễ phải là số dương" });
      continue;
    }

    const motherMedium = parsed.motherMediumCode
      ? await prisma.mediumType.findUnique({ where: { code: parsed.motherMediumCode }, select: { id: true } })
      : null;
    if (!motherMedium) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Không tìm thấy mã môi trường nhân mẫu mẹ "${parsed.motherMediumCode}"` });
      continue;
    }
    const finishedMedium = parsed.finishedMediumCode
      ? await prisma.mediumType.findUnique({ where: { code: parsed.finishedMediumCode }, select: { id: true } })
      : null;
    if (!finishedMedium) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Không tìm thấy mã môi trường ra rễ "${parsed.finishedMediumCode}"` });
      continue;
    }

    let assignedToId = shelf.assignedStaffId ?? undefined;
    if (!assignedToId && parsed.staffCode) {
      const u = await prisma.user.findUnique({ where: { code: parsed.staffCode }, select: { id: true, role: true } });
      if (!u || u.role !== "CAY_MO") {
        errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Không tìm thấy mã NV cấy mô "${parsed.staffCode}"` });
        continue;
      }
      assignedToId = u.id;
    }

    const weekStartParsed = cellDate(parsed.weekStartRaw);
    if (weekStartParsed === null) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: "Tuần thực hiện không hợp lệ" });
      continue;
    }

    let status: "DRAFT" | "ACTIVE" = "ACTIVE";
    if (parsed.status) {
      const resolved = STATUS_LABEL_TO_ENUM.get(parsed.status.toLowerCase());
      if (!resolved) {
        errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Trạng thái "${parsed.status}" không hợp lệ (Nháp/Đang thực hiện)` });
        continue;
      }
      status = resolved;
    }

    const plannedT01Quantity = parsed.plannedT01 ? Number(parsed.plannedT01) : 0;
    const plannedT05Quantity = parsed.plannedT05 ? Number(parsed.plannedT05) : 0;
    if (!Number.isFinite(plannedT01Quantity) || plannedT01Quantity < 0 || !Number.isFinite(plannedT05Quantity) || plannedT05Quantity < 0) {
      errors.push({ row: parsed.row, label: parsed.shelfCode, message: "Kế hoạch túi T01/T05 phải là số nguyên không âm" });
      continue;
    }

    if (parsed.code) {
      const codeKey = parsed.code.toLowerCase();
      if (claimedCodes.has(codeKey)) {
        errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Mã chỉ định "${parsed.code}" trùng 1 dòng khác trong file` });
        continue;
      }
      const existing = await prisma.plantingInstruction.findFirst({ where: { code: parsed.code }, select: { id: true } });
      if (existing) {
        errors.push({ row: parsed.row, label: parsed.shelfCode, message: `Mã chỉ định "${parsed.code}" đã tồn tại` });
        continue;
      }
      claimedCodes.add(codeKey);
    }

    validRows.push({
      row: parsed.row,
      codeOverride: parsed.code,
      plantTypeId: plantType.id,
      shelfId: shelf.id,
      shelfCode: shelf.code,
      warehouseCode: shelf.warehouse.code,
      lotId: lot.id,
      stageCode: parsed.stageCode,
      quantity,
      motherSampleRatio,
      rootingRatio,
      expectedMotherOutput: Math.floor(quantity * motherSampleRatio),
      expectedFinishedOutput: Math.floor(quantity * rootingRatio),
      motherMediumTypeId: motherMedium.id,
      finishedMediumTypeId: finishedMedium.id,
      assignedToId,
      weekStart: weekStartParsed ?? undefined,
      status,
      plannedT01Quantity,
      plannedT05Quantity,
      notes: parsed.notes,
    });
  }

  // ---- Giai đoạn 2: tạo hàng loạt trong 1 transaction ----
  let successCount = 0;
  if (validRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        const code = vr.codeOverride ?? (await generateInstructionCode({ warehouseCode: vr.warehouseCode, shelfCode: vr.shelfCode, client: tx }));
        await tx.plantingInstruction.create({
          data: {
            code,
            plantTypeId: vr.plantTypeId,
            createdById: session!.user.id,
            assignedToId: vr.assignedToId,
            notes: vr.notes,
            inputMotherQuantity: vr.quantity,
            expectedMotherOutput: vr.expectedMotherOutput,
            expectedFinishedOutput: vr.expectedFinishedOutput,
            plannedT01Quantity: vr.plannedT01Quantity,
            plannedT05Quantity: vr.plannedT05Quantity,
            weekStart: vr.weekStart,
            status: vr.status,
            items: {
              create: [
                {
                  shelfId: vr.shelfId,
                  lotId: vr.lotId,
                  stageCode: vr.stageCode,
                  quantity: vr.quantity,
                  motherSampleRatio: vr.motherSampleRatio,
                  rootingRatio: vr.rootingRatio,
                  expectedMotherOutput: vr.expectedMotherOutput,
                  expectedFinishedOutput: vr.expectedFinishedOutput,
                  motherMediumTypeId: vr.motherMediumTypeId,
                  finishedMediumTypeId: vr.finishedMediumTypeId,
                },
              ],
            },
          },
        });
        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
