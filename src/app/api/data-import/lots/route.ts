import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { addWeeks } from "date-fns";
import { lotCodeBase } from "@/lib/codes";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { resolveShelfAttributeUpdate, type ShelfAttributeUpdateData } from "@/lib/shelf-attribute-update";
import { sumLotQuantity } from "@/types";

const MAX_CODE_ATTEMPTS = 50;
const FINISHED_ROOM_TYPES = ["PHONG_KHA_DUNG", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG"] as const;

type RowError = { row: number; label: string; message: string };

// Nhập hàng loạt LÔ ĐANG TỒN THẬT ngoài đời (mẫu mẹ/ra rễ trên kệ, thành phẩm trong phòng kho TP) —
// nền tảng bắt buộc để Chỉ định cấy/Phiếu bàn giao nhập sau có lô để tham chiếu. 1 cột "Mã vị trí"
// dùng chung cho cả kệ lẫn phòng — server tự phân biệt bằng cách tra Shelf trước, không thấy thì tra
// Room. Với kệ Phòng mẫu mẹ, tái dùng đúng logic gán mã cây/mã NV + giới hạn theo sức chứa (capacity)
// như /api/shelves/import để không lệch quy tắc nghiệp vụ.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel lô tồn kho" }, { status: 403 });
  }

  const [plantTypes, staff, finishedRooms] = await Promise.all([
    prisma.plantType.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.room.findMany({
      where: { type: { in: [...FINISHED_ROOM_TYPES] }, isActive: true },
      select: { code: true, name: true, warehouse: { select: { code: true } } },
      orderBy: { code: "asc" },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Lô tồn kho");
  sheet.columns = [
    { header: "Mã vị trí (kệ hoặc phòng kho TP)", key: "location", width: 24 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Quy cách (M03/M05/T01/T05)", key: "stageCode", width: 20 },
    { header: "Số lượng", key: "quantity", width: 12 },
    { header: "Mã NV cấy mô phụ trách", key: "staffCode", width: 18 },
    { header: "Ngày nhập lô", key: "enteredAt", width: 14 },
    { header: "Mã lô (để trống = tự sinh)", key: "lotCode", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3, 4, 6]);
  sheet.addRow({
    location: "SX-A-PS-A01C01",
    plantTypeCode: plantTypes[0]?.code ?? "MT001",
    stageCode: "M03",
    quantity: 300,
    staffCode: staff[0]?.code ?? "NVCM010",
    enteredAt: "01/07/2026",
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
  for (const s of staff) helpSheet.addRow({ type: "Mã NV", code: s.code, name: s.name });
  for (const r of finishedRooms) helpSheet.addRow({ type: "Phòng kho TP", code: r.code, name: `${r.name} (${r.warehouse.code})` });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM lô mới — không xoá/sửa lô đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã vị trí: gõ mã kệ (Phòng mẫu mẹ/Phòng ra rễ) hoặc mã phòng kho thành phẩm." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "M03/M05 chỉ dùng cho kệ Phòng mẫu mẹ. T01/T05 dùng cho kệ Phòng ra rễ hoặc phòng kho TP." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã NV cấy mô chỉ cần cho lô Mẫu mẹ/Ra rễ (dùng sinh mã lô) — bỏ trống nếu là lô Thành phẩm trong kho TP." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "1 kệ (mẫu mẹ hoặc ra rễ) có thể chứa cả 2 quy cách cùng lúc (VD cả M03 lẫn M05, hoặc cả T01 lẫn T05), miễn tổng số lượng không vượt sức chứa (capacity) của kệ." });

  addGuideSheet(workbook, [
    { column: "Mã vị trí (kệ hoặc phòng kho TP)", required: true, description: "Mã kệ (Phòng mẫu mẹ/Phòng ra rễ) hoặc mã phòng kho thành phẩm — hệ thống tự phân biệt." },
    { column: "Mã cây", required: true, description: "Mã loại cây, xem sheet Danh mục." },
    { column: "Quy cách (M03/M05/T01/T05)", required: true, description: "M03/M05 chỉ dùng cho kệ Phòng mẫu mẹ. T01/T05 dùng cho kệ Phòng ra rễ hoặc phòng kho TP." },
    { column: "Số lượng", required: true, description: "Số nguyên dương — tổng số lượng trên 1 vị trí (cộng dồn nhiều dòng) không được vượt sức chứa của kệ." },
    { column: "Mã NV cấy mô phụ trách", required: false, description: "Chỉ cần cho lô Mẫu mẹ/Ra rễ (dùng sinh mã lô) — bỏ trống nếu là lô Thành phẩm trong kho TP." },
    { column: "Ngày nhập lô", required: true, description: "Định dạng dd/mm/yyyy." },
    { column: "Mã lô (để trống = tự sinh)", required: false, description: "Để trống để hệ thống tự sinh mã theo quy tắc chuẩn, hoặc gõ tay mã lô có sẵn ngoài đời." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-lo-ton-kho.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel lô tồn kho" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Lô tồn kho") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    location: string;
    plantTypeCode?: string;
    stageCode?: string;
    quantity?: string;
    staffCode?: string;
    enteredAtRaw: ExcelJS.CellValue;
    lotCode?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const location = cellText(row.getCell(1).value);
    if (!location) return;
    parsedRows.push({
      row: rowNumber,
      location,
      plantTypeCode: cellText(row.getCell(2).value) || undefined,
      stageCode: cellText(row.getCell(3).value) || undefined,
      quantity: cellText(row.getCell(4).value) || undefined,
      staffCode: cellText(row.getCell(5).value) || undefined,
      enteredAtRaw: row.getCell(6).value,
      lotCode: cellText(row.getCell(7).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  type ResolvedPlantType = { id: string; code: string; transferWaitWeeks: number; rootingWeeks: number };
  type ValidRow = {
    row: number;
    label: string;
    shelfId?: string;
    roomId?: string;
    shelfUpdateData?: ShelfAttributeUpdateData;
    plantType: ResolvedPlantType;
    stageCode: string;
    lotStage: "MAU_ME" | "THANH_PHAM";
    quantity: number;
    staffCode: string | null;
    enteredAt: Date;
    expectedMoveAt: Date | null;
    lotCodeOverride?: string;
  };

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedShelfUsage = new Map<string, number>();
  const claimedLotCodeOverrides = new Set<string>();

  for (const parsed of parsedRows) {
    const shelf = await prisma.shelf.findFirst({
      where: { code: parsed.location, isActive: true, room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } } },
      select: {
        id: true,
        plantTypeId: true,
        assignedStaffId: true,
        capacity: true,
        room: { select: { type: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
    });

    const room = shelf
      ? null
      : await prisma.room.findFirst({
          where: { code: parsed.location, type: { in: [...FINISHED_ROOM_TYPES] } },
          select: { id: true, type: true },
        });

    if (!shelf && !room) {
      errors.push({ row: parsed.row, label: parsed.location, message: "Không tìm thấy kệ hoặc phòng kho thành phẩm có mã này" });
      continue;
    }

    const isMauMeShelf = !!shelf && shelf.room?.type === "PHONG_MAU_ME";
    const isRaReShelf = !!shelf && shelf.room?.type === "PHONG_RA_RE";
    const validStageCodes = isMauMeShelf ? new Set(["M03", "M05"]) : new Set(["T01", "T05"]);

    if (!parsed.stageCode || !validStageCodes.has(parsed.stageCode)) {
      errors.push({
        row: parsed.row,
        label: parsed.location,
        message: `Cần Quy cách hợp lệ (${Array.from(validStageCodes).join("/")}) cho vị trí này`,
      });
      continue;
    }

    if (!parsed.plantTypeCode) {
      errors.push({ row: parsed.row, label: parsed.location, message: "Thiếu Mã cây" });
      continue;
    }
    const plantType = await prisma.plantType.findUnique({
      where: { code: parsed.plantTypeCode },
      select: { id: true, code: true, transferWaitWeeks: true, rootingWeeks: true },
    });
    if (!plantType) {
      errors.push({ row: parsed.row, label: parsed.location, message: `Không tìm thấy mã cây "${parsed.plantTypeCode}"` });
      continue;
    }

    const quantityNum = Number(parsed.quantity);
    if (!parsed.quantity || !Number.isFinite(quantityNum) || !Number.isInteger(quantityNum) || quantityNum <= 0) {
      errors.push({ row: parsed.row, label: parsed.location, message: "Số lượng phải là số nguyên dương" });
      continue;
    }

    let staffCode: string | null = null;
    let resolvedStaffId: string | undefined;
    if (shelf && parsed.staffCode) {
      const u = await prisma.user.findUnique({ where: { code: parsed.staffCode }, select: { id: true, role: true, code: true } });
      if (!u || u.role !== "CAY_MO") {
        errors.push({ row: parsed.row, label: parsed.location, message: `Không tìm thấy mã NV cấy mô "${parsed.staffCode}"` });
        continue;
      }
      staffCode = u.code;
      resolvedStaffId = u.id;
    }

    const enteredAtParsed = cellDate(parsed.enteredAtRaw);
    if (enteredAtParsed === null) {
      errors.push({ row: parsed.row, label: parsed.location, message: "Ngày nhập lô không hợp lệ" });
      continue;
    }
    const enteredAt = enteredAtParsed ?? new Date();

    let shelfUpdateData: ShelfAttributeUpdateData | undefined;
    if (shelf) {
      // Sức chứa (capacity) áp dụng cho CẢ kệ Phòng mẫu mẹ lẫn Phòng ra rễ như nhau — 1 kệ có thể chứa
      // nhiều quy cách cùng lúc (mẫu mẹ: M03+M05, ra rễ: T01+T05), giới hạn duy nhất là capacity. Trước
      // đây chỉ kiểm tra cho Phòng mẫu mẹ, bỏ sót Phòng ra rễ khiến nhập vượt sức chứa không báo lỗi.
      // Cộng dồn theo claimedShelfUsage vì cùng 1 kệ có thể xuất hiện ở nhiều dòng trong CÙNG 1 file
      // import (VD 1 dòng M03, 1 dòng M05 cho cùng 1 kệ).
      const used = sumLotQuantity(shelf.lots) + (claimedShelfUsage.get(shelf.id) ?? 0);
      if (shelf.capacity != null && used + quantityNum > shelf.capacity) {
        errors.push({
          row: parsed.row,
          label: parsed.location,
          message: `Kệ ${parsed.location} không đủ chỗ (còn trống ${Math.max(0, shelf.capacity - used)}/${shelf.capacity})`,
        });
        continue;
      }

      // Gán mã cây/mã NV thẳng vào Shelf chỉ có ý nghĩa ở Phòng mẫu mẹ (field đó luôn null ở Phòng ra
      // rễ — 1 kệ ra rễ có thể chứa nhiều mã cây khác nhau cùng lúc, xem shelves/import/route.ts).
      if (isMauMeShelf) {
        const attrResult = await resolveShelfAttributeUpdate(prisma, shelf.id, {
          plantTypeId: plantType.id === shelf.plantTypeId ? undefined : plantType.id,
          assignedStaffId: resolvedStaffId && resolvedStaffId !== shelf.assignedStaffId ? resolvedStaffId : undefined,
        });
        if (!attrResult.ok) {
          errors.push({ row: parsed.row, label: parsed.location, message: attrResult.message });
          continue;
        }
        shelfUpdateData = attrResult.data;
      }
      claimedShelfUsage.set(shelf.id, used + quantityNum);
    }

    let lotCodeOverride: string | undefined;
    if (parsed.lotCode) {
      const key = `${parsed.lotCode}::${parsed.stageCode}`;
      if (claimedLotCodeOverrides.has(key)) {
        errors.push({ row: parsed.row, label: parsed.location, message: `Mã lô "${parsed.lotCode}" (${parsed.stageCode}) trùng 1 dòng khác trong file` });
        continue;
      }
      const existingLot = await prisma.lot.findFirst({ where: { code: parsed.lotCode, stageCode: parsed.stageCode }, select: { id: true } });
      if (existingLot) {
        errors.push({ row: parsed.row, label: parsed.location, message: `Mã lô "${parsed.lotCode}" (${parsed.stageCode}) đã tồn tại` });
        continue;
      }
      claimedLotCodeOverrides.add(key);
      lotCodeOverride = parsed.lotCode;
    }

    const expectedMoveAt = isMauMeShelf
      ? addWeeks(enteredAt, plantType.transferWaitWeeks)
      : isRaReShelf
        ? addWeeks(enteredAt, plantType.rootingWeeks)
        : null;

    validRows.push({
      row: parsed.row,
      label: parsed.location,
      shelfId: shelf?.id,
      roomId: room?.id,
      shelfUpdateData,
      plantType,
      stageCode: parsed.stageCode,
      lotStage: isMauMeShelf ? "MAU_ME" : "THANH_PHAM",
      quantity: quantityNum,
      staffCode,
      enteredAt,
      expectedMoveAt,
      lotCodeOverride,
    });
  }

  // ---- Giai đoạn 2: tạo hàng loạt trong 1 transaction ----
  let successCount = 0;
  if (validRows.length > 0) {
    const claimedLotCodes = new Set<string>();
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        if (vr.shelfId && vr.shelfUpdateData && Object.keys(vr.shelfUpdateData).length > 0) {
          await tx.shelf.update({ where: { id: vr.shelfId }, data: vr.shelfUpdateData });
        }

        let code = vr.lotCodeOverride;
        if (!code) {
          const base = lotCodeBase({ plantTypeCode: vr.plantType.code, staffCode: vr.staffCode ?? "NV000", date: vr.enteredAt });
          let attempt = 0;
          for (;;) {
            attempt += 1;
            code = attempt === 1 ? base : `${base}-${attempt}`;
            const key = `${code}::${vr.stageCode}`;
            if (attempt > MAX_CODE_ATTEMPTS) throw new Error(`Không sinh được mã lô duy nhất cho ${vr.label}`);
            if (claimedLotCodes.has(key)) continue;
            const existingLot = await tx.lot.findFirst({ where: { code, stageCode: vr.stageCode }, select: { id: true } });
            if (existingLot) continue;
            claimedLotCodes.add(key);
            break;
          }
        }

        await tx.lot.create({
          data: {
            code: code!,
            plantTypeId: vr.plantType.id,
            stage: vr.lotStage,
            stageCode: vr.stageCode,
            shelfId: vr.shelfId,
            roomId: vr.roomId,
            quantity: vr.quantity,
            initialQuantity: vr.quantity,
            status: "ACTIVE",
            enteredAt: vr.enteredAt,
            expectedMoveAt: vr.expectedMoveAt,
          },
        });

        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
