import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { startOfWeek, endOfWeek } from "date-fns";
import { generateInstructionCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import {
  parseDailyRecordNumbers, hasAnyDailyRecordDayValue, computeEndReason, applyDailyRecordDay,
  type DailyRecordDayNumberFields, type DailyRecordDayNumbers,
} from "@/lib/daily-record-import";
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
//
// Kèm luôn dữ liệu cấy hàng ngày cho chỉ định "Đang thực hiện" (khác Nháp — chưa bắt đầu thì chưa có
// ngày nào): dòng đầu tiên của 1 Mã chỉ định vừa định nghĩa chỉ định vừa có thể điền luôn ngày đầu tiên;
// muốn thêm ngày tiếp theo thì thêm dòng mới CÙNG Mã chỉ định, chỉ điền các cột ngày cấy (bỏ trống toàn
// bộ cột định nghĩa chỉ định — Mã kệ nguồn/Mã lô nguồn/...). Tái dùng đúng logic nghiệp vụ của mục "Cập
// nhật dữ liệu cấy" (xem src/lib/daily-record-import.ts) để không lệch quy tắc cộng dồn MM đã kiểm
// tra/sử dụng, Phòng nhiễm, và điều kiện tự kết thúc chỉ định.
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
    { header: "Quy cách nguồn (M05)", key: "stageCode", width: 18 },
    { header: "Số lượng dùng (cụm)", key: "quantity", width: 16 },
    { header: "Tỉ lệ nhân mẫu mẹ", key: "motherSampleRatio", width: 16 },
    { header: "Tỉ lệ ra rễ", key: "rootingRatio", width: 12 },
    { header: "Mã môi trường nhân mẫu mẹ", key: "motherMediumCode", width: 22 },
    { header: "Mã môi trường ra rễ", key: "finishedMediumCode", width: 18 },
    { header: "Mã NV cấy mô phụ trách", key: "staffCode", width: 18 },
    { header: "Tuần thực hiện", key: "weekStart", width: 14 },
    { header: "Trạng thái (Nháp/Đang thực hiện)", key: "status", width: 20 },
    { header: "Kế hoạch T01 (cây)", key: "plannedT01", width: 16 },
    { header: "Kế hoạch T05 (cây)", key: "plannedT05", width: 16 },
    { header: "Ghi chú", key: "notes", width: 26 },
    { header: "Ngày cấy (nếu Đang thực hiện)", key: "recordDate", width: 20 },
    { header: "MM đã kiểm tra (cụm)", key: "motherChecked", width: 18 },
    { header: "MM nhiễm (cụm)", key: "motherContaminatedM05", width: 16 },
    { header: "MM sử dụng (cụm)", key: "motherUsed", width: 16 },
    { header: "M05 mới cấy (cụm)", key: "m05", width: 16 },
    { header: "T05 thành phẩm (cây)", key: "t05", width: 16 },
    { header: "T01 thành phẩm (cây)", key: "t01", width: 16 },
    { header: "Ghi chú ngày cấy", key: "dayNotes", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [2, 3, 4, 5, 6, 7, 8, 9, 10, 12]);
  sheet.addRow({
    plantTypeCode: plantTypes[0]?.code ?? "MT001",
    shelfCode: shelves[0]?.code ?? "SX-A-PS-A01C01",
    lotCode: shelves[0]?.lots[0]?.code ?? "MT001010726",
    stageCode: shelves[0]?.lots[0]?.stageCode ?? "M05",
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
    recordDate: "01/07/2026",
    motherChecked: 100,
    motherUsed: 20,
    m05: 20,
    t05: 5,
  });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 16 },
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
  helpSheet.addRow({
    type: "Ghi chú", code: "",
    name: "Cột \"Ngày cấy\" trở đi: CHỈ áp dụng khi Trạng thái = Đang thực hiện (chỉ định Nháp chưa bắt đầu nên chưa có ngày nào). Dòng đầu vừa tạo chỉ định vừa có thể điền luôn ngày đầu tiên.",
  });
  helpSheet.addRow({
    type: "Ghi chú", code: "",
    name: "Muốn thêm ngày thứ 2 trở đi cho CÙNG 1 chỉ định: thêm dòng mới, điền lại đúng Mã chỉ định ở dòng đầu (không để trống — bắt buộc để hệ thống nối đúng chỉ định), bỏ trống toàn bộ cột định nghĩa chỉ định (Mã cây/Mã kệ nguồn/.../Trạng thái), chỉ điền các cột Ngày cấy trở đi.",
  });

  addGuideSheet(workbook, [
    { column: "Mã chỉ định (để trống = tự sinh)", required: false, description: "Để trống để hệ thống tự sinh mã theo quy tắc chuẩn. Muốn thêm ngày cấy thứ 2 trở đi cho cùng 1 chỉ định thì BẮT BUỘC phải điền (và lặp lại đúng) mã này ở các dòng thêm ngày." },
    { column: "Mã cây", required: true, description: "Mã loại cây, xem sheet Danh mục. Bỏ trống ở dòng chỉ thêm ngày cấy (đã xác định qua Mã chỉ định)." },
    { column: "Mã kệ nguồn", required: true, description: "Kệ trong Phòng mẫu mẹ của Kho sản xuất, xem sheet Danh mục. Bỏ trống ở dòng chỉ thêm ngày cấy — có giá trị nghĩa là dòng đó định nghĩa 1 chỉ định mới." },
    { column: "Mã lô nguồn", required: true, description: "Lô đang ACTIVE trên đúng kệ nguồn — nhập ở mục \"Lô tồn kho hiện có\" trước nếu chưa có." },
    { column: "Quy cách nguồn (M05)", required: true, description: "Chỉ nhận giá trị M05." },
    { column: "Số lượng dùng (cụm)", required: true, description: "Số nguyên dương, tính theo CỤM (không phải túi) — số mẫu mẹ lấy từ lô nguồn để cấy." },
    { column: "Tỉ lệ nhân mẫu mẹ", required: true, description: "Số dương — dùng tính sản lượng mẫu mẹ dự kiến, đơn vị cụm (Số lượng dùng × tỉ lệ)." },
    { column: "Tỉ lệ ra rễ", required: true, description: "Số không âm (0 = xác nhận chỉ định không ra thành phẩm) — dùng tính sản lượng thành phẩm dự kiến, đơn vị cây (Số lượng dùng × tỉ lệ)." },
    { column: "Mã môi trường nhân mẫu mẹ", required: true, description: "Mã môi trường dùng để nhân mẫu mẹ, xem sheet Danh mục." },
    { column: "Mã môi trường ra rễ", required: true, description: "Mã môi trường dùng để ra rễ thành phẩm, xem sheet Danh mục." },
    { column: "Mã NV cấy mô phụ trách", required: false, description: "Bỏ trống nếu kệ nguồn đã \"chia\" sẵn cho 1 NV (hệ thống tự gán). Bắt buộc nếu muốn nhập kèm ngày cấy và kệ nguồn chưa chia sẵn NV." },
    { column: "Tuần thực hiện", required: true, description: "Định dạng dd/mm/yyyy — ngày bất kỳ trong tuần thực hiện." },
    { column: "Trạng thái (Nháp/Đang thực hiện)", required: false, description: "Để trống = mặc định \"Đang thực hiện\". Chỉ chỉ định \"Đang thực hiện\" mới được kèm dữ liệu ngày cấy." },
    { column: "Kế hoạch T01 (cây)", required: false, description: "Số nguyên không âm, tính theo cây. Để trống = 0." },
    { column: "Kế hoạch T05 (cây)", required: false, description: "Số nguyên không âm, tính theo cây. Để trống = 0." },
    { column: "Ghi chú", required: false, description: "Ghi chú tự do cho chỉ định." },
    { column: "Ngày cấy (nếu Đang thực hiện)", required: false, description: "Định dạng dd/mm/yyyy — bắt buộc nếu dòng có điền bất kỳ cột dữ liệu ngày nào bên dưới. Phải nằm trong Tuần thực hiện, không được ở tương lai." },
    { column: "MM đã kiểm tra (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm. Để trống = 0. Cộng dồn mọi ngày của chỉ định không được vượt Số lượng dùng." },
    { column: "MM nhiễm (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm. Để trống = 0 — cộng dồn vào Phòng nhiễm của kho." },
    { column: "MM sử dụng (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm. Để trống = 0 — dùng để tự động kết thúc chỉ định khi đạt/vượt Số lượng dùng." },
    { column: "M05 mới cấy (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm — số lượng mẫu mẹ M05 mới nhân được trong ngày. Để trống = 0." },
    { column: "T05 thành phẩm (cây)", required: false, description: "Số nguyên không âm, tính theo cây — số cây ra rễ T05 mới trong ngày. Để trống = 0." },
    { column: "T01 thành phẩm (cây)", required: false, description: "Số nguyên không âm, tính theo cây — số cây ra rễ T01 mới trong ngày. Để trống = 0." },
    { column: "Ghi chú ngày cấy", required: false, description: "Ghi chú tự do riêng cho ngày này." },
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
    recordDateRaw: ExcelJS.CellValue;
    dayFields: DailyRecordDayNumberFields;
    dayNotes?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const code = cellText(row.getCell(1).value) || undefined;
    const shelfCode = cellText(row.getCell(3).value);
    const dayFields: DailyRecordDayNumberFields = {
      motherChecked: cellText(row.getCell(18).value) || undefined,
      motherContaminatedM05: cellText(row.getCell(19).value) || undefined,
      motherUsed: cellText(row.getCell(20).value) || undefined,
      m05: cellText(row.getCell(21).value) || undefined,
      t05: cellText(row.getCell(22).value) || undefined,
      t01: cellText(row.getCell(23).value) || undefined,
    };
    const recordDateRaw = row.getCell(17).value;
    const dayNotes = cellText(row.getCell(24).value) || undefined;
    if (!shelfCode && !code && !hasAnyDailyRecordDayValue(dayFields, recordDateRaw)) return; // dòng trống hoàn toàn

    parsedRows.push({
      row: rowNumber,
      code,
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
      recordDateRaw,
      dayFields,
      dayNotes,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  // Gộp nhóm theo Mã chỉ định — mọi dòng cùng Mã chỉ định (không rỗng) thuộc 1 nhóm, dùng để thêm nhiều
  // ngày cấy cho cùng 1 chỉ định. Dòng không có Mã chỉ định luôn tự thành 1 nhóm riêng (đúng hành vi cũ:
  // mỗi dòng = 1 chỉ định độc lập, mã tự sinh).
  const groups = new Map<string, ParsedRow[]>();
  let soloSeq = 0;
  for (const parsed of parsedRows) {
    const key = parsed.code ? `code:${parsed.code.toLowerCase()}` : `solo:${++soloSeq}`;
    const list = groups.get(key) ?? [];
    list.push(parsed);
    groups.set(key, list);
  }

  type ValidInstructionRow = {
    row: number;
    codeOverride?: string;
    plantTypeId: string;
    shelfId: string;
    shelfCode: string;
    warehouseId: string;
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
    plantTypeCode: string;
    transferWaitWeeks: number;
    rootingWeeks: number;
  };

  type ValidDayRow = {
    row: number;
    label: string;
    recordDate: Date;
    numbers: DailyRecordDayNumbers;
    notes?: string;
    endReason: "MOTHER_USED_UP" | "TIME_UP" | null;
  };

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  const claimedCodes = new Set<string>();
  const groupOrder: string[] = [];
  const instructionByGroup = new Map<string, ValidInstructionRow>();
  const dayRowsByGroup = new Map<string, ValidDayRow[]>();
  const personalRoomCache = new Map<string, string>();

  for (const [groupKey, rows] of groups) {
    groupOrder.push(groupKey);
    const definingCandidates = rows.filter((r) => !!r.shelfCode);

    if (definingCandidates.length === 0) {
      for (const r of rows) {
        errors.push({ row: r.row, label: r.code ?? "(dòng trống)", message: `Mã chỉ định "${r.code}" cần có đúng 1 dòng chứa Mã kệ nguồn để định nghĩa chỉ định` });
      }
      continue;
    }
    if (definingCandidates.length > 1) {
      for (const r of definingCandidates.slice(1)) {
        errors.push({
          row: r.row,
          label: r.shelfCode,
          message: `Mã chỉ định "${r.code}" đã được định nghĩa ở 1 dòng khác — dòng này không được điền lại Mã kệ nguồn/cột định nghĩa chỉ định, chỉ để thêm ngày cấy`,
        });
      }
      continue;
    }
    const definingRow = definingCandidates[0];

    // Dòng cùng nhóm không phải dòng định nghĩa và không có dữ liệu ngày cấy nào = dòng thừa vô nghĩa.
    for (const r of rows) {
      if (r === definingRow) continue;
      if (!hasAnyDailyRecordDayValue(r.dayFields, r.recordDateRaw)) {
        errors.push({ row: r.row, label: r.code ?? "", message: `Dòng chỉ có Mã chỉ định "${r.code}" nhưng không có dữ liệu ngày cấy nào — xoá dòng thừa hoặc điền dữ liệu ngày` });
      }
    }

    const plantType = definingRow.plantTypeCode
      ? await prisma.plantType.findUnique({ where: { code: definingRow.plantTypeCode }, select: { id: true, code: true, transferWaitWeeks: true, rootingWeeks: true } })
      : null;
    if (!plantType) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Không tìm thấy mã cây "${definingRow.plantTypeCode}"` });
      continue;
    }

    const shelf = await prisma.shelf.findFirst({
      where: { code: definingRow.shelfCode, room: { type: "PHONG_MAU_ME" }, warehouse: { type: "SAN_XUAT" } },
      select: { id: true, code: true, assignedStaffId: true, warehouseId: true, warehouse: { select: { code: true } } },
    });
    if (!shelf) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: "Chỉ được chọn kệ trong Phòng mẫu mẹ của Kho sản xuất" });
      continue;
    }

    if (definingRow.stageCode !== "M05") {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Quy cách nguồn "${definingRow.stageCode}" không hợp lệ (chỉ nhận M05)` });
      continue;
    }
    const lot = await prisma.lot.findFirst({
      where: { code: definingRow.lotCode, stageCode: definingRow.stageCode, shelfId: shelf.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!lot) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Không tìm thấy lô ACTIVE "${definingRow.lotCode}" (${definingRow.stageCode}) trên kệ này` });
      continue;
    }

    const quantity = Number(definingRow.quantity);
    if (!definingRow.quantity || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: "Số lượng dùng phải là số nguyên dương" });
      continue;
    }
    const motherSampleRatio = Number(definingRow.motherSampleRatio);
    if (!definingRow.motherSampleRatio || !Number.isFinite(motherSampleRatio) || motherSampleRatio <= 0) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: "Tỉ lệ nhân mẫu mẹ phải là số dương" });
      continue;
    }
    const rootingRatio = Number(definingRow.rootingRatio);
    if (!definingRow.rootingRatio || !Number.isFinite(rootingRatio) || rootingRatio < 0) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: "Tỉ lệ ra rễ phải là số không âm" });
      continue;
    }

    const motherMedium = definingRow.motherMediumCode
      ? await prisma.mediumType.findUnique({ where: { code: definingRow.motherMediumCode }, select: { id: true } })
      : null;
    if (!motherMedium) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Không tìm thấy mã môi trường nhân mẫu mẹ "${definingRow.motherMediumCode}"` });
      continue;
    }
    const finishedMedium = definingRow.finishedMediumCode
      ? await prisma.mediumType.findUnique({ where: { code: definingRow.finishedMediumCode }, select: { id: true } })
      : null;
    if (!finishedMedium) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Không tìm thấy mã môi trường ra rễ "${definingRow.finishedMediumCode}"` });
      continue;
    }

    let assignedToId = shelf.assignedStaffId ?? undefined;
    if (!assignedToId && definingRow.staffCode) {
      const u = await prisma.user.findUnique({ where: { code: definingRow.staffCode }, select: { id: true, role: true } });
      if (!u || u.role !== "CAY_MO") {
        errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Không tìm thấy mã NV cấy mô "${definingRow.staffCode}"` });
        continue;
      }
      assignedToId = u.id;
    }

    const weekStartParsed = cellDate(definingRow.weekStartRaw);
    if (weekStartParsed === null) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: "Tuần thực hiện không hợp lệ" });
      continue;
    }

    let status: "DRAFT" | "ACTIVE" = "ACTIVE";
    if (definingRow.status) {
      const resolved = STATUS_LABEL_TO_ENUM.get(definingRow.status.toLowerCase());
      if (!resolved) {
        errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Trạng thái "${definingRow.status}" không hợp lệ (Nháp/Đang thực hiện)` });
        continue;
      }
      status = resolved;
    }

    const plannedT01Quantity = definingRow.plannedT01 ? Number(definingRow.plannedT01) : 0;
    const plannedT05Quantity = definingRow.plannedT05 ? Number(definingRow.plannedT05) : 0;
    if (!Number.isFinite(plannedT01Quantity) || plannedT01Quantity < 0 || !Number.isFinite(plannedT05Quantity) || plannedT05Quantity < 0) {
      errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: "Kế hoạch T01/T05 (cây) phải là số nguyên không âm" });
      continue;
    }

    if (definingRow.code) {
      const codeKey = definingRow.code.toLowerCase();
      if (claimedCodes.has(codeKey)) {
        errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Mã chỉ định "${definingRow.code}" trùng 1 dòng khác trong file` });
        continue;
      }
      const existing = await prisma.plantingInstruction.findFirst({ where: { code: definingRow.code }, select: { id: true } });
      if (existing) {
        errors.push({ row: definingRow.row, label: definingRow.shelfCode, message: `Mã chỉ định "${definingRow.code}" đã tồn tại` });
        continue;
      }
      claimedCodes.add(codeKey);
    }

    const validInstruction: ValidInstructionRow = {
      row: definingRow.row,
      codeOverride: definingRow.code,
      plantTypeId: plantType.id,
      shelfId: shelf.id,
      shelfCode: shelf.code,
      warehouseId: shelf.warehouseId,
      warehouseCode: shelf.warehouse.code,
      lotId: lot.id,
      stageCode: definingRow.stageCode,
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
      notes: definingRow.notes,
      plantTypeCode: plantType.code,
      transferWaitWeeks: plantType.transferWaitWeeks,
      rootingWeeks: plantType.rootingWeeks,
    };

    // ---- Dữ liệu cấy hàng ngày kèm theo (nếu có) — chỉ áp dụng cho chỉ định "Đang thực hiện" ----
    const dayCandidates = rows.filter((r) => hasAnyDailyRecordDayValue(r.dayFields, r.recordDateRaw));
    if (dayCandidates.length > 0) {
      if (status === "DRAFT") {
        for (const dr of dayCandidates) {
          errors.push({ row: dr.row, label: dr.code ?? definingRow.shelfCode, message: "Chỉ định \"Nháp\" không được kèm dữ liệu cấy ngày — chỉ áp dụng cho \"Đang thực hiện\"" });
        }
      } else if (!validInstruction.weekStart) {
        for (const dr of dayCandidates) {
          errors.push({ row: dr.row, label: dr.code ?? definingRow.shelfCode, message: "Chỉ định chưa có Tuần thực hiện hợp lệ nên không thể kèm dữ liệu cấy ngày" });
        }
      } else if (!assignedToId) {
        for (const dr of dayCandidates) {
          errors.push({ row: dr.row, label: dr.code ?? definingRow.shelfCode, message: "Chỉ định chưa gán NV cấy mô phụ trách nên không thể kèm dữ liệu cấy ngày" });
        }
      } else {
        const weekStartOfInst = startOfWeek(validInstruction.weekStart, { weekStartsOn: 1 });
        const weekEndOfInst = endOfWeek(validInstruction.weekStart, { weekStartsOn: 1 });

        // Xử lý theo đúng thứ tự ngày tăng dần (không phải thứ tự dòng trong file) để MM đã kiểm tra/MM
        // sử dụng cộng dồn đúng — giống hệt api/data-import/daily-records.
        const parsedDays = dayCandidates.map((dr) => ({ dr, recordDate: cellDate(dr.recordDateRaw) }));
        parsedDays.sort((a, b) => (a.recordDate?.getTime() ?? 0) - (b.recordDate?.getTime() ?? 0));

        let cumulativeMotherChecked = 0;
        let cumulativeMotherUsed = 0;
        const claimedDates = new Set<string>();
        let alreadyEnded = false;
        const validDays: ValidDayRow[] = [];

        for (const { dr, recordDate } of parsedDays) {
          if (!recordDate) {
            errors.push({ row: dr.row, label: dr.code ?? "", message: "Ngày cấy không hợp lệ hoặc để trống" });
            continue;
          }
          if (recordDate > new Date()) {
            errors.push({ row: dr.row, label: dr.code ?? "", message: "Ngày cấy không được ở tương lai" });
            continue;
          }
          if (alreadyEnded) {
            errors.push({ row: dr.row, label: dr.code ?? "", message: "Chỉ định đã kết thúc ở 1 dòng ngày trước đó trong file — không thể thêm ngày sau đó" });
            continue;
          }
          if (recordDate < weekStartOfInst || recordDate > weekEndOfInst) {
            errors.push({
              row: dr.row,
              label: dr.code ?? "",
              message: `Ngày cấy phải trong tuần thực hiện của chỉ định (${weekStartOfInst.toLocaleDateString("vi-VN")} - ${weekEndOfInst.toLocaleDateString("vi-VN")})`,
            });
            continue;
          }
          const dateKey = recordDate.toISOString().slice(0, 10);
          if (claimedDates.has(dateKey)) {
            errors.push({ row: dr.row, label: dr.code ?? "", message: `Đã có 1 dòng khác trong nhóm cho ngày này` });
            continue;
          }

          const numbersResult = parseDailyRecordNumbers(dr.dayFields);
          if ("error" in numbersResult) {
            errors.push({ row: dr.row, label: dr.code ?? "", message: numbersResult.error });
            continue;
          }
          const { numbers } = numbersResult;

          const newMotherChecked = cumulativeMotherChecked + numbers.motherChecked;
          if (newMotherChecked > quantity) {
            errors.push({
              row: dr.row,
              label: dr.code ?? "",
              message: `Tổng MM đã kiểm tra (${newMotherChecked} cụm) vượt quá Số lượng dùng của chỉ định (${quantity} cụm)`,
            });
            continue;
          }

          const newMotherUsed = cumulativeMotherUsed + numbers.motherUsed;
          const endReason = computeEndReason(newMotherUsed, quantity, recordDate, weekEndOfInst);

          cumulativeMotherChecked = newMotherChecked;
          cumulativeMotherUsed = newMotherUsed;
          claimedDates.add(dateKey);
          if (endReason) alreadyEnded = true;

          validDays.push({ row: dr.row, label: dr.code ?? "", recordDate, numbers, notes: dr.dayNotes, endReason });
        }

        if (validDays.length > 0) {
          dayRowsByGroup.set(groupKey, validDays);
          const roomCacheKey = `${assignedToId}::${shelf.warehouseId}`;
          if (!personalRoomCache.has(roomCacheKey)) {
            const room = await getOrCreatePersonalDarkRoom(assignedToId, shelf.warehouseId);
            personalRoomCache.set(roomCacheKey, room.id);
          }
        }
      }
    }

    instructionByGroup.set(groupKey, validInstruction);
  }

  // ---- Giai đoạn 2: tạo hàng loạt trong 1 transaction — chỉ khi cả file không còn dòng lỗi nào ----
  let successCount = 0;
  if (instructionByGroup.size > 0 && errors.length === 0) {
    await prisma.$transaction(async (tx) => {
      for (const groupKey of groupOrder) {
        const vr = instructionByGroup.get(groupKey);
        if (!vr) continue;

        const code = vr.codeOverride ?? (await generateInstructionCode({ warehouseCode: vr.warehouseCode, shelfCode: vr.shelfCode, client: tx }));
        const days = dayRowsByGroup.get(groupKey) ?? [];

        const created = await tx.plantingInstruction.create({
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

        // Ngày cấy đã được validate + tính sẵn endReason theo đúng thứ tự ngày ở Giai đoạn 1 — applyDailyRecordDay
        // tự chuyển chỉ định "Kết thúc" ngay khi gặp đúng ngày kích hoạt điều kiện, không cần tính lại ở đây.
        if (days.length > 0 && vr.assignedToId) {
          const roomCacheKey = `${vr.assignedToId}::${vr.warehouseId}`;
          const personalRoomId = personalRoomCache.get(roomCacheKey)!;

          for (const day of days) {
            await applyDailyRecordDay(tx, {
              instructionId: created.id,
              instructionCode: created.code,
              assignedToId: vr.assignedToId,
              recordDate: day.recordDate,
              numbers: day.numbers,
              notes: day.notes,
              plantTypeId: vr.plantTypeId,
              plantTypeCode: vr.plantTypeCode,
              transferWaitWeeks: vr.transferWaitWeeks,
              rootingWeeks: vr.rootingWeeks,
              warehouseId: vr.warehouseId,
              warehouseCode: vr.warehouseCode,
              personalRoomId,
              endReason: day.endReason,
            });
          }
        }
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
