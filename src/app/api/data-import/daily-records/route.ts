import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, format } from "date-fns";
import { vi } from "date-fns/locale";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { parseDailyRecordNumbers, computeEndReason, applyDailyRecordDay, type DailyRecordDayNumbers } from "@/lib/daily-record-import";

type RowError = { row: number; label: string; message: string };

// Nhập hàng loạt DỮ LIỆU CẤY HÀNG NGÀY (nhật ký cấy) cho các chỉ định ĐANG THỰC HIỆN — bù dữ liệu ghi
// trên giấy chưa kịp nhập vào hệ thống (VD hôm nay Thứ 4 nhưng chưa nhập dữ liệu Thứ 2/3/4). Tái dùng
// đúng logic của POST /api/daily-records (form "Cập nhật số liệu" NV cấy mô dùng hàng ngày): 1 dòng = 1
// chỉ định + 1 ngày, tự tạo Lô sản phẩm vào Phòng tối cá nhân của NV phụ trách, cộng dồn Phòng nhiễm,
// tự kết thúc chỉ định nếu dùng hết mẫu mẹ/hết tuần — KHÔNG bắn cảnh báo lệch tiến độ/nhiễm cao (giống
// mục "Chỉ định cấy đang hoạt động": đây là dữ liệu backfill phản ánh việc đã xảy ra, không phải việc
// mới cần KY_THUAT/KHO_MO xử lý ngay).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel dữ liệu cấy" }, { status: 403 });
  }

  const instructions = await prisma.plantingInstruction.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
    select: {
      code: true,
      weekStart: true,
      plantType: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { code: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Dữ liệu cấy");
  sheet.columns = [
    { header: "Mã chỉ định", key: "instructionCode", width: 22 },
    { header: "Ngày nhập liệu", key: "recordDate", width: 14 },
    { header: "MM đã kiểm tra (cụm)", key: "motherChecked", width: 18 },
    { header: "MM nhiễm (cụm)", key: "motherContaminatedM05", width: 16 },
    { header: "MM sử dụng (cụm)", key: "motherUsed", width: 16 },
    { header: "M05 mới cấy (cụm)", key: "m05", width: 16 },
    { header: "T05 thành phẩm (cây)", key: "t05", width: 16 },
    { header: "T01 thành phẩm (cây)", key: "t01", width: 16 },
    { header: "Ghi chú", key: "notes", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2]);
  sheet.addRow({
    instructionCode: instructions[0]?.code ?? "CDAA01C05201026",
    recordDate: "13/07/2026",
    motherChecked: 100,
    motherContaminatedM05: 2,
    motherUsed: 98,
    m05: 35,
    t05: 10,
    t01: 5,
  });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 18 },
    { header: "Mã", key: "code", width: 22 },
    { header: "Tên", key: "name", width: 40 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const i of instructions) {
    const weekLabel = i.weekStart
      ? `Tuần ${format(startOfWeek(i.weekStart, { weekStartsOn: 1 }), "dd/MM", { locale: vi })} - ${format(endOfWeek(i.weekStart, { weekStartsOn: 1 }), "dd/MM", { locale: vi })}`
      : "Chưa có tuần thực hiện";
    helpSheet.addRow({
      type: "Chỉ định cấy",
      code: i.code,
      name: `${i.plantType.name} — NV ${i.assignedTo?.name ?? "chưa gán"} — ${weekLabel}`,
    });
  }
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM dữ liệu ngày mới — không sửa/xoá dữ liệu ngày đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mỗi chỉ định chỉ được 1 dòng cho 1 ngày — muốn nhập nhiều ngày (VD Thứ 2 - Thứ 4) thì mỗi ngày 1 dòng riêng, cùng Mã chỉ định." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Ngày nhập liệu phải nằm trong đúng tuần thực hiện của chỉ định đó, và không được là ngày tương lai." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Để trống các cột số lượng = 0. Tổng MM đã kiểm tra cộng dồn mọi ngày không được vượt số mẫu mẹ được cấp cho chỉ định." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Chỉ định tự chuyển \"Kết thúc\" nếu dùng hết mẫu mẹ được cấp, hoặc Ngày nhập liệu rơi đúng Chủ nhật của tuần thực hiện — giống hệt khi NV cấy mô tự lưu hàng ngày." });

  addGuideSheet(workbook, [
    { column: "Mã chỉ định", required: true, description: "Mã chỉ định cấy đang \"Nháp\"/\"Đang thực hiện\", xem sheet Danh mục." },
    { column: "Ngày nhập liệu", required: true, description: "Định dạng dd/mm/yyyy — phải trong tuần thực hiện của chỉ định, không được ở tương lai." },
    { column: "MM đã kiểm tra (cụm)", required: false, description: "Số nguyên không âm, tính theo CỤM (không phải túi). Để trống = 0. Cộng dồn mọi ngày không được vượt số mẫu mẹ được cấp cho chỉ định." },
    { column: "MM nhiễm (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm. Để trống = 0 — cộng dồn vào Phòng nhiễm của kho." },
    { column: "MM sử dụng (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm. Để trống = 0 — dùng để tự động kết thúc chỉ định khi đạt/vượt số mẫu mẹ được cấp." },
    { column: "M05 mới cấy (cụm)", required: false, description: "Số nguyên không âm, tính theo cụm — số lượng mẫu mẹ M05 mới nhân được trong ngày. Để trống = 0." },
    { column: "T05 thành phẩm (cây)", required: false, description: "Số nguyên không âm, tính theo cây — số cây ra rễ T05 mới trong ngày. Để trống = 0." },
    { column: "T01 thành phẩm (cây)", required: false, description: "Số nguyên không âm, tính theo cây — số cây ra rễ T01 mới trong ngày. Để trống = 0." },
    { column: "Ghi chú", required: false, description: "Ghi chú tự do cho ngày này." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-du-lieu-cay.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel dữ liệu cấy" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Dữ liệu cấy") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    instructionCode: string;
    recordDate: Date | null;
    motherChecked?: string;
    motherContaminatedM05?: string;
    motherUsed?: string;
    m05?: string;
    t05?: string;
    t01?: string;
    notes?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const instructionCode = cellText(row.getCell(1).value);
    if (!instructionCode) return;
    const recordDateParsed = cellDate(row.getCell(2).value);
    parsedRows.push({
      row: rowNumber,
      instructionCode,
      recordDate: recordDateParsed ?? null,
      motherChecked: cellText(row.getCell(3).value) || undefined,
      motherContaminatedM05: cellText(row.getCell(4).value) || undefined,
      motherUsed: cellText(row.getCell(5).value) || undefined,
      m05: cellText(row.getCell(6).value) || undefined,
      t05: cellText(row.getCell(7).value) || undefined,
      t01: cellText(row.getCell(8).value) || undefined,
      notes: cellText(row.getCell(9).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  // Xử lý theo đúng thứ tự thời gian (Mã chỉ định, rồi Ngày nhập liệu tăng dần) để MM đã kiểm tra/MM sử
  // dụng cộng dồn đúng thứ tự thật, kể cả khi các dòng trong file không xếp sẵn theo thứ tự ngày.
  parsedRows.sort((a, b) => {
    const codeCompare = a.instructionCode.localeCompare(b.instructionCode);
    if (codeCompare !== 0) return codeCompare;
    return (a.recordDate?.getTime() ?? 0) - (b.recordDate?.getTime() ?? 0);
  });

  type ResolvedInstruction = {
    id: string;
    code: string;
    assignedToId: string | null;
    weekStart: Date | null;
    inputMotherQuantity: number;
    status: string;
    plantTypeId: string;
    plantTypeCode: string;
    transferWaitWeeks: number;
    rootingWeeks: number;
    warehouseId: string | null;
    warehouseCode: string | null;
  };

  type ValidRow = {
    row: number;
    label: string;
    instructionId: string;
    instructionCode: string;
    assignedToId: string;
    recordDate: Date;
    numbers: DailyRecordDayNumbers;
    notes?: string;
    plantTypeId: string;
    plantTypeCode: string;
    transferWaitWeeks: number;
    rootingWeeks: number;
    warehouseId: string;
    warehouseCode: string;
    personalRoomId: string;
    endReason: "MOTHER_USED_UP" | "TIME_UP" | null;
  };

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const instructionCache = new Map<string, ResolvedInstruction | null>();
  const personalRoomCache = new Map<string, string>();
  const cumulativeMotherChecked = new Map<string, number>();
  const cumulativeMotherUsed = new Map<string, number>();
  const claimedDates = new Map<string, Set<string>>();
  const endedInBatch = new Set<string>();

  for (const parsed of parsedRows) {
    if (!parsed.recordDate) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: "Ngày nhập liệu không hợp lệ hoặc để trống" });
      continue;
    }
    if (parsed.recordDate > new Date()) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: "Ngày nhập liệu không được ở tương lai" });
      continue;
    }

    let inst = instructionCache.get(parsed.instructionCode);
    if (inst === undefined) {
      const found = await prisma.plantingInstruction.findFirst({
        where: { code: parsed.instructionCode },
        select: {
          id: true,
          code: true,
          assignedToId: true,
          weekStart: true,
          inputMotherQuantity: true,
          status: true,
          plantTypeId: true,
          plantType: { select: { code: true, transferWaitWeeks: true, rootingWeeks: true } },
          items: { select: { shelf: { select: { warehouseId: true, warehouse: { select: { code: true } } } } }, take: 1 },
        },
      });
      inst = found
        ? {
            id: found.id,
            code: found.code,
            assignedToId: found.assignedToId,
            weekStart: found.weekStart,
            inputMotherQuantity: found.inputMotherQuantity,
            status: found.status,
            plantTypeId: found.plantTypeId,
            plantTypeCode: found.plantType.code,
            transferWaitWeeks: found.plantType.transferWaitWeeks,
            rootingWeeks: found.plantType.rootingWeeks,
            warehouseId: found.items[0]?.shelf?.warehouseId ?? null,
            warehouseCode: found.items[0]?.shelf?.warehouse.code ?? null,
          }
        : null;
      instructionCache.set(parsed.instructionCode, inst);
    }
    if (!inst) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: `Không tìm thấy chỉ định "${parsed.instructionCode}"` });
      continue;
    }
    if (!inst.warehouseId || !inst.warehouseCode) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: "Không xác định được kho sản xuất của chỉ định" });
      continue;
    }
    if (!inst.assignedToId) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: "Chỉ định chưa gán NV cấy mô phụ trách" });
      continue;
    }
    if (inst.status === "ENDED" || endedInBatch.has(inst.id)) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: "Chỉ định đã kết thúc — không thể nhập thêm dữ liệu ngày" });
      continue;
    }
    if (!inst.weekStart) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: "Chỉ định chưa có Tuần thực hiện" });
      continue;
    }

    const weekStartOfInst = startOfWeek(inst.weekStart, { weekStartsOn: 1 });
    const weekEndOfInst = endOfWeek(inst.weekStart, { weekStartsOn: 1 });
    if (parsed.recordDate < weekStartOfInst || parsed.recordDate > weekEndOfInst) {
      errors.push({
        row: parsed.row,
        label: parsed.instructionCode,
        message: `Ngày nhập liệu phải trong tuần thực hiện của chỉ định (${format(weekStartOfInst, "dd/MM", { locale: vi })} - ${format(weekEndOfInst, "dd/MM", { locale: vi })})`,
      });
      continue;
    }

    const dateKey = format(parsed.recordDate, "yyyy-MM-dd");
    const claimedSet = claimedDates.get(inst.id) ?? new Set<string>();
    if (claimedSet.has(dateKey)) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: `Đã có 1 dòng khác trong file cho ngày ${format(parsed.recordDate, "dd/MM/yyyy")} của chỉ định này` });
      continue;
    }
    const existingRecord = await prisma.dailyRecord.findFirst({
      where: { instructionId: inst.id, recordDate: { gte: startOfDay(parsed.recordDate), lte: endOfDay(parsed.recordDate) } },
      select: { id: true },
    });
    if (existingRecord) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: `Đã có dữ liệu ngày ${format(parsed.recordDate, "dd/MM/yyyy")} cho chỉ định này trong hệ thống` });
      continue;
    }

    if (!cumulativeMotherChecked.has(inst.id)) {
      const agg = await prisma.dailyRecord.aggregate({
        where: { instructionId: inst.id },
        _sum: { motherChecked: true, motherUsed: true },
      });
      cumulativeMotherChecked.set(inst.id, agg._sum.motherChecked ?? 0);
      cumulativeMotherUsed.set(inst.id, agg._sum.motherUsed ?? 0);
    }

    const numbersResult = parseDailyRecordNumbers(parsed);
    if ("error" in numbersResult) {
      errors.push({ row: parsed.row, label: parsed.instructionCode, message: numbersResult.error });
      continue;
    }
    const { numbers } = numbersResult;

    const newMotherChecked = (cumulativeMotherChecked.get(inst.id) ?? 0) + numbers.motherChecked;
    if (newMotherChecked > inst.inputMotherQuantity) {
      errors.push({
        row: parsed.row,
        label: parsed.instructionCode,
        message: `Tổng MM đã kiểm tra (${newMotherChecked} cụm) vượt quá số mẫu mẹ được cấp cho chỉ định (${inst.inputMotherQuantity} cụm)`,
      });
      continue;
    }

    const roomCacheKey = `${inst.assignedToId}::${inst.warehouseId}`;
    let personalRoomId = personalRoomCache.get(roomCacheKey);
    if (!personalRoomId) {
      const room = await getOrCreatePersonalDarkRoom(inst.assignedToId, inst.warehouseId);
      personalRoomId = room.id;
      personalRoomCache.set(roomCacheKey, personalRoomId);
    }

    const newMotherUsed = (cumulativeMotherUsed.get(inst.id) ?? 0) + numbers.motherUsed;
    const endReason = computeEndReason(newMotherUsed, inst.inputMotherQuantity, parsed.recordDate, weekEndOfInst);

    cumulativeMotherChecked.set(inst.id, newMotherChecked);
    cumulativeMotherUsed.set(inst.id, newMotherUsed);
    claimedSet.add(dateKey);
    claimedDates.set(inst.id, claimedSet);
    if (endReason) endedInBatch.add(inst.id);

    validRows.push({
      row: parsed.row,
      label: parsed.instructionCode,
      instructionId: inst.id,
      instructionCode: inst.code,
      assignedToId: inst.assignedToId,
      recordDate: parsed.recordDate,
      numbers,
      notes: parsed.notes,
      plantTypeId: inst.plantTypeId,
      plantTypeCode: inst.plantTypeCode,
      transferWaitWeeks: inst.transferWaitWeeks,
      rootingWeeks: inst.rootingWeeks,
      warehouseId: inst.warehouseId,
      warehouseCode: inst.warehouseCode,
      personalRoomId,
      endReason,
    });
  }

  // ---- Giai đoạn 2: tạo hàng loạt trong 1 transaction ----
  let successCount = 0;
  if (validRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        await applyDailyRecordDay(tx, {
          instructionId: vr.instructionId,
          instructionCode: vr.instructionCode,
          assignedToId: vr.assignedToId,
          recordDate: vr.recordDate,
          numbers: vr.numbers,
          notes: vr.notes,
          plantTypeId: vr.plantTypeId,
          plantTypeCode: vr.plantTypeCode,
          transferWaitWeeks: vr.transferWaitWeeks,
          rootingWeeks: vr.rootingWeeks,
          warehouseId: vr.warehouseId,
          warehouseCode: vr.warehouseCode,
          personalRoomId: vr.personalRoomId,
          endReason: vr.endReason,
        });
        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
