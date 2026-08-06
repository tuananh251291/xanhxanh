import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { addWeeks } from "date-fns";
import { lotCodeBase } from "@/lib/codes";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { resolveShelfAttributeUpdate } from "@/lib/shelf-attribute-update";

const MAX_CODE_ATTEMPTS = 50;
const FINISHED_ROOM_TYPES = ["PHONG_DAT_TIEU_CHUAN", "PHONG_THEO_DOI", "PHONG_HAN_TUI", "PHONG_THI_TRUONG"] as const;

type RowError = { row: number; label: string; message: string };

// Nhập hàng loạt LÔ ĐANG TỒN THẬT ngoài đời (mẫu mẹ/ra rễ trên kệ, thành phẩm trong phòng kho TP) —
// nền tảng bắt buộc để Chỉ định cấy/Phiếu bàn giao nhập sau có lô để tham chiếu. 1 cột "Mã vị trí"
// dùng chung cho cả kệ lẫn phòng — server tự phân biệt bằng cách tra Shelf trước, không thấy thì tra
// Room. Với kệ Phòng mẫu mẹ, tái dùng đúng logic gán mã cây/mã NV + giới hạn theo sức chứa (capacity)
// như /api/shelves/import để không lệch quy tắc nghiệp vụ.
//
// CẬP NHẬT THAY THẾ (không còn "chỉ thêm" như trước): CHỈ đúng combo (vị trí + mã cây + quy cách) xuất
// hiện trong file mới bị ghi đè — lô hiện có của đúng combo đó bị sửa quantity thành số mới (để trống ô
// số lượng = 0, kể cả về 0 vẫn giữ nguyên bản ghi Lot, không xoá). Vị trí KHÔNG xuất hiện trong file, hoặc
// combo (mã cây/quy cách khác) trên CÙNG 1 vị trí có mặt trong file nhưng không được khai ở dòng nào —
// GIỮ NGUYÊN số lượng cũ, không đụng tới. Xem addGuideSheet bên dưới để hiểu chi tiết.
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
    { header: "Mã NV cấy mô phụ trách", key: "staffCode", width: 18 },
    { header: "Ngày nhập lô", key: "enteredAt", width: 14 },
    { header: "Mã lô (để trống = tự sinh)", key: "lotCode", width: 20 },
    { header: "Số lượng M05", key: "quantityM05", width: 14 },
    { header: "Số lượng T01", key: "quantityT01", width: 14 },
    { header: "Số lượng T05", key: "quantityT05", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 4]);
  sheet.addRow({
    location: "SX-A-PS-A01C01",
    plantTypeCode: plantTypes[0]?.code ?? "MT001",
    staffCode: staff[0]?.code ?? "NVCM010",
    enteredAt: "01/07/2026",
    quantityM05: 300,
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
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "CẬP NHẬT THAY THẾ: CHỈ đúng combo (vị trí + mã cây + quy cách) có dòng khai trong file mới bị ghi đè số lượng — mọi vị trí/combo KHÔNG xuất hiện trong file đều GIỮ NGUYÊN số lượng cũ, không đụng tới." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Với combo có dòng khai trong file: lô hiện có được sửa đúng số lượng mới (không có lô thì tạo mới, số lượng 0 thì không tạo gì)." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Để trống ô Số lượng (khi dòng đó CÓ khai vị trí/mã cây này) = hiểu là 0 — tức lô combo đó bị đưa về 0." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã vị trí: gõ mã kệ (Phòng mẫu mẹ/Phòng ra rễ) hoặc mã phòng kho thành phẩm." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "M05 chỉ dùng cho kệ Phòng mẫu mẹ. T01/T05 dùng cho kệ Phòng ra rễ hoặc phòng kho TP." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã NV cấy mô chỉ cần cho lô Mẫu mẹ/Ra rễ (dùng sinh mã lô) — bỏ trống nếu là lô Thành phẩm trong kho TP." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Riêng kệ Phòng mẫu mẹ: bỏ trống Mã cây (và cột Số lượng M05) = báo kệ này hiện KHÔNG còn gì — hệ thống tự xoá gán mã cây dedicate của kệ (về trạng thái chưa gán) và đưa mọi lô đang có trên kệ về 0. Kệ Phòng ra rễ/phòng kho TP vẫn bắt buộc phải điền Mã cây (1 vị trí có thể có nhiều mã cây cùng lúc, không xác định được nếu bỏ trống)." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Kệ Phòng mẫu mẹ ĐÃ CHIA (đã dedicate 1 NV/mã cây) chỉ nên xuất hiện đúng 1 dòng/file. Kệ mẫu mẹ CHUNG (chưa dedicate) thì được nhiều dòng/mã cây khác nhau, miễn không dòng nào gán Mã NV phụ trách. Phòng ra rễ/phòng kho TP luôn được nhiều dòng (nhiều mã cây khác nhau)." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "1 dòng có thể điền cả 2 cột Số lượng phù hợp với vị trí (VD cả T01 lẫn T05 cho 1 kệ ra rễ) để cập nhật đồng thời 2 lô — miễn tổng không vượt sức chứa (capacity) của kệ." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã lô (nếu điền) chỉ có tác dụng khi TẠO LÔ MỚI (vị trí + mã cây + quy cách đó chưa có lô nào) và dòng chỉ có đúng 1 cột Số lượng khác 0 — nếu vị trí đó đã có lô sẵn (đang cập nhật số lượng) thì cột này bị bỏ qua, lô giữ nguyên mã cũ." });

  addGuideSheet(workbook, [
    { column: "Mã vị trí (kệ hoặc phòng kho TP)", required: true, description: "Mã kệ (Phòng mẫu mẹ/Phòng ra rễ) hoặc mã phòng kho thành phẩm — hệ thống tự phân biệt." },
    { column: "Mã cây", required: true, description: "Mã loại cây, xem sheet Danh mục. Riêng kệ Phòng mẫu mẹ: bỏ trống (kèm Số lượng M05 cũng để trống) = dọn trống kệ, xoá gán mã cây dedicate + đưa mọi lô trên kệ về 0." },
    { column: "Mã NV cấy mô phụ trách", required: false, description: "Chỉ cần cho lô Mẫu mẹ/Ra rễ (dùng sinh mã lô) — bỏ trống nếu là lô Thành phẩm trong kho TP." },
    { column: "Ngày nhập lô", required: true, description: "Định dạng dd/mm/yyyy." },
    { column: "Mã lô (để trống = tự sinh)", required: false, description: "Chỉ áp dụng khi tạo lô mới (vị trí + mã cây + quy cách chưa từng có lô) — bỏ qua nếu vị trí đó đã có lô, chỉ đang cập nhật số lượng." },
    { column: "Số lượng M05 / T01 / T05", required: false, description: "Để trống = 0 (combo mã cây + quy cách đó ở đúng vị trí này bị đưa về 0). Combo/vị trí không có dòng nào khai trong file thì giữ nguyên số lượng cũ, không bị đụng tới." },
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
    staffCode?: string;
    enteredAtRaw: ExcelJS.CellValue;
    lotCode?: string;
    quantityM05?: string;
    quantityT01?: string;
    quantityT05?: string;
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
      staffCode: cellText(row.getCell(3).value) || undefined,
      enteredAtRaw: row.getCell(4).value,
      lotCode: cellText(row.getCell(5).value) || undefined,
      quantityM05: cellText(row.getCell(6).value) || undefined,
      quantityT01: cellText(row.getCell(7).value) || undefined,
      quantityT05: cellText(row.getCell(8).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  type ResolvedPlantType = { id: string; code: string; transferWaitWeeks: number; rootingWeeks: number };
  type StageEntry = { stageCode: string; quantity: number; lotCodeOverride?: string };
  type ValidRow = {
    row: number;
    label: string;
    shelfId?: string;
    roomId?: string;
    isMauMeShelf: boolean;
    shelfCapacity: number | null;
    // Trạng thái gán NV hiện tại của kệ (đọc từ DB lúc validate) — null = kệ "chung" (chưa dedicate,
    // có thể chứa nhiều mã cây cùng lúc), khác null = kệ "đã chia" (dedicate 1 mã cây/NV). Dùng để quyết
    // định có cho phép nhiều dòng cùng 1 kệ (khác mã cây) hay không, xem Giai đoạn 1.5.
    shelfAssignedStaffId: string | null;
    // null CHỈ khi clearMauMeShelf = true (dòng "dọn trống kệ" — bỏ trống Mã cây, xem bên dưới).
    plantType: ResolvedPlantType | null;
    lotStage: "MAU_ME" | "THANH_PHAM";
    staffCode: string | null;
    resolvedStaffId?: string;
    enteredAt: Date;
    expectedMoveAt: Date | null;
    stageEntries: StageEntry[];
    // Dòng chỉ khai Mã vị trí (kệ Phòng mẫu mẹ) + bỏ trống Mã cây — báo "kệ này hiện không còn gì": xoá
    // gán mã cây dedicate của kệ + đưa MỌI lô đang ACTIVE trên kệ về 0 (xem Giai đoạn 2). stageEntries
    // luôn rỗng với dòng này (không khai combo mã cây + quy cách nào).
    clearMauMeShelf: boolean;
  };

  // ---- Giai đoạn 1: validate từng dòng riêng lẻ, không ghi DB ----
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedLotCodeOverrides = new Set<string>();

  for (const parsed of parsedRows) {
    const shelf = await prisma.shelf.findFirst({
      where: { code: parsed.location, isActive: true, room: { type: { in: ["PHONG_MAU_ME", "PHONG_RA_RE"] } } },
      select: { id: true, plantTypeId: true, assignedStaffId: true, capacity: true, room: { select: { type: true } } },
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

    if (!parsed.plantTypeCode) {
      if (!isMauMeShelf) {
        errors.push({ row: parsed.row, label: parsed.location, message: "Thiếu Mã cây" });
        continue;
      }
      // Dòng "dọn trống kệ" — chỉ có ý nghĩa với kệ Phòng mẫu mẹ (1 kệ = 1 mã cây dedicate). Không chấp
      // nhận kèm Số lượng khác 0 (không xác định được gán cho mã cây nào) hay cột T01/T05 (sai vị trí).
      if (parsed.quantityT01 || parsed.quantityT05) {
        errors.push({ row: parsed.row, label: parsed.location, message: `Cột Số lượng ${parsed.quantityT01 ? "T01" : "T05"} không dùng được cho vị trí này` });
        continue;
      }
      const m05 = parsed.quantityM05 ? Number(parsed.quantityM05) : 0;
      if (parsed.quantityM05 && (!Number.isFinite(m05) || m05 !== 0)) {
        errors.push({ row: parsed.row, label: parsed.location, message: "Đã bỏ trống Mã cây (dọn trống kệ) nhưng vẫn có Số lượng M05 khác 0 — không xác định được gán cho mã cây nào" });
        continue;
      }
      validRows.push({
        row: parsed.row,
        label: parsed.location,
        shelfId: shelf!.id,
        isMauMeShelf: true,
        shelfCapacity: shelf!.capacity ?? null,
        shelfAssignedStaffId: shelf!.assignedStaffId,
        plantType: null,
        lotStage: "MAU_ME",
        staffCode: null,
        enteredAt: cellDate(parsed.enteredAtRaw) ?? new Date(),
        expectedMoveAt: null,
        stageEntries: [],
        clearMauMeShelf: true,
      });
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

    // Mỗi vị trí chỉ có quy cách hợp lệ riêng (M05 cho kệ mẫu mẹ, T01/T05 cho kệ ra rễ/phòng kho TP) —
    // điền nhầm cột của quy cách còn lại coi là lỗi nhập nhầm cột, báo rõ thay vì âm thầm bỏ qua.
    const wrongCols: [string, string | undefined][] = isMauMeShelf
      ? [["T01", parsed.quantityT01], ["T05", parsed.quantityT05]]
      : [["M05", parsed.quantityM05]];
    const wrongFilled = wrongCols.find(([, raw]) => !!raw);
    if (wrongFilled) {
      errors.push({ row: parsed.row, label: parsed.location, message: `Cột Số lượng ${wrongFilled[0]} không dùng được cho vị trí này` });
      continue;
    }

    // Ghi đè: MỖI cột số lượng phù hợp với vị trí luôn tạo ra 1 entry — để trống = 0 (nghĩa là "vị trí
    // này không còn tồn combo mã cây + quy cách đó"), khác hẳn kiểu "để trống = bỏ qua dòng đó" như bản
    // cũ (chỉ thêm). Không còn yêu cầu "phải điền ít nhất 1 cột" vì để trống hết vẫn có nghĩa (0 tất cả).
    const ownCols: [string, string | undefined][] = isMauMeShelf
      ? [["M05", parsed.quantityM05]]
      : [["T01", parsed.quantityT01], ["T05", parsed.quantityT05]];
    const stageEntries: StageEntry[] = [];
    let stageError = false;
    for (const [stageCode, raw] of ownCols) {
      const n = raw ? Number(raw) : 0;
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        errors.push({ row: parsed.row, label: parsed.location, message: `Số lượng ${stageCode} phải là số nguyên không âm` });
        stageError = true;
        break;
      }
      stageEntries.push({ stageCode, quantity: n });
    }
    if (stageError) continue;

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

    // Mã lô nhập tay chỉ có ý nghĩa khi TẠO MỚI — chỉ chấp nhận khi dòng có đúng 1 cột Số lượng KHÁC 0
    // (không rõ nên gán cho combo nào nếu 2 cột cùng khác 0). Việc "vị trí đã có lô sẵn nên bỏ qua mã
    // này" được xử lý ở Giai đoạn 2 (không biết trước ở đây vì còn phụ thuộc lô hiện có lúc ghi).
    if (parsed.lotCode) {
      const nonZero = stageEntries.filter((e) => e.quantity > 0);
      if (nonZero.length !== 1) {
        errors.push({
          row: parsed.row,
          label: parsed.location,
          message: "Mã lô chỉ áp dụng được khi dòng có đúng 1 cột Số lượng khác 0 — tách thành 2 dòng nếu cần 2 mã lô riêng",
        });
        continue;
      }
      const stageCode = nonZero[0].stageCode;
      const key = `${parsed.lotCode}::${stageCode}`;
      if (claimedLotCodeOverrides.has(key)) {
        errors.push({ row: parsed.row, label: parsed.location, message: `Mã lô "${parsed.lotCode}" (${stageCode}) trùng 1 dòng khác trong file` });
        continue;
      }
      const existingLot = await prisma.lot.findFirst({ where: { code: parsed.lotCode, stageCode }, select: { id: true } });
      if (existingLot) {
        errors.push({ row: parsed.row, label: parsed.location, message: `Mã lô "${parsed.lotCode}" (${stageCode}) đã tồn tại` });
        continue;
      }
      claimedLotCodeOverrides.add(key);
      nonZero[0].lotCodeOverride = parsed.lotCode;
    }

    // Mẫu mẹ (MAU_ME): KHÔNG tính expectedMoveAt từ Ngày nhập lô — "đạt hạn cấy chuyển" tính thuần theo
    // Nhóm tuần mẫu mẹ của giàn kệ đích. Ngày nhập lô vẫn bắt buộc điền vì còn dùng để sắp thứ tự rút
    // FIFO khi dồn/xếp lại giàn (xem moveMotherStock).
    const expectedMoveAt = isRaReShelf ? addWeeks(enteredAt, plantType.rootingWeeks) : null;

    validRows.push({
      row: parsed.row,
      label: parsed.location,
      shelfId: shelf?.id,
      roomId: room?.id,
      isMauMeShelf,
      shelfCapacity: shelf?.capacity ?? null,
      shelfAssignedStaffId: shelf?.assignedStaffId ?? null,
      plantType,
      lotStage: isMauMeShelf ? "MAU_ME" : "THANH_PHAM",
      staffCode,
      resolvedStaffId,
      enteredAt,
      expectedMoveAt,
      stageEntries,
      clearMauMeShelf: false,
    });
  }

  // ---- Giai đoạn 1.5: gộp các dòng theo vị trí (kệ/phòng), xây "trạng thái đích" cho ĐÚNG các combo
  // (mã cây, quy cách) được khai trong file — combo khác trên cùng vị trí không có trong targets thì giữ
  // nguyên, không đụng tới (xử lý ở Giai đoạn 2) ----
  type Target = { plantTypeId: string; stageCode: string; quantity: number; source: ValidRow; lotCodeOverride?: string };
  type LocationGroup = {
    shelfId?: string;
    roomId?: string;
    isMauMeShelf: boolean;
    capacity: number | null;
    label: string;
    shelfAssignedStaffId: string | null;
    targets: Map<string, Target>; // key = `${plantTypeId}::${stageCode}`
    mauMeRows: ValidRow[]; // dùng để validate + áp dụng gán mã cây/NV (chỉ có ý nghĩa ở Phòng mẫu mẹ)
  };
  const groups = new Map<string, LocationGroup>();
  for (const vr of validRows) {
    const key = vr.shelfId ? `shelf:${vr.shelfId}` : `room:${vr.roomId}`;
    let g = groups.get(key);
    if (!g) {
      g = { shelfId: vr.shelfId, roomId: vr.roomId, isMauMeShelf: vr.isMauMeShelf, capacity: vr.shelfCapacity, label: vr.label, shelfAssignedStaffId: vr.shelfAssignedStaffId, targets: new Map(), mauMeRows: [] };
      groups.set(key, g);
    }
    for (const entry of vr.stageEntries) {
      // stageEntries luôn rỗng khi clearMauMeShelf = true (vr.plantType null) — vòng lặp này không bao
      // giờ chạy với dòng đó, plantType chắc chắn khác null ở đây.
      const comboKey = `${vr.plantType!.id}::${entry.stageCode}`;
      if (g.targets.has(comboKey)) {
        errors.push({ row: vr.row, label: vr.label, message: `Trùng dữ liệu quy cách ${entry.stageCode} + mã cây ${vr.plantType!.code} tại vị trí này — đã khai ở 1 dòng khác trong file` });
        continue;
      }
      g.targets.set(comboKey, { plantTypeId: vr.plantType!.id, stageCode: entry.stageCode, quantity: entry.quantity, source: vr, lotCodeOverride: entry.lotCodeOverride });
    }
    if (vr.isMauMeShelf) g.mauMeRows.push(vr);
  }

  // >1 dòng cùng 1 kệ Phòng mẫu mẹ (mỗi dòng 1 mã cây khác nhau) CHỈ hợp lệ nếu đây là kệ "chung" (chưa
  // dedicate cho 1 NV/mã cây cố định — assignedStaffId null lúc đọc, xem matchesAllowedCodes ở
  // src/lib/shelf-assignment.ts) và không dòng nào cố gán NV phụ trách riêng (staffCode) — khi đó mỗi
  // dòng chỉ là 1 lô (mã cây riêng) cùng chung 1 kệ, không đụng gì tới plantTypeId/assignedStaffId của
  // Shelf. Kệ ĐÃ CHIA (assignedStaffId khác null, dedicate đúng 1 mã cây) thì vẫn chỉ cho phép đúng 1
  // dòng/file như cũ — 2 mã cây khác nhau cho cùng 1 kệ đã chia là mâu thuẫn.
  for (const g of groups.values()) {
    if (g.mauMeRows.length <= 1) continue;
    if (g.shelfAssignedStaffId) {
      const rowsList = g.mauMeRows.map((r) => r.row).join(", ");
      errors.push({ row: g.mauMeRows[0].row, label: g.label, message: `Kệ này đã dedicate cho 1 NV cấy mô (kệ "đã chia") — chỉ nhận đúng 1 mã cây, không thể khai nhiều mã cây khác nhau (đang trùng ở các dòng ${rowsList})` });
      continue;
    }
    const staffRow = g.mauMeRows.find((r) => r.resolvedStaffId);
    if (staffRow) {
      errors.push({ row: staffRow.row, label: g.label, message: `Kệ chung (nhiều mã cây khác nhau) không gán NV phụ trách riêng theo dòng — bỏ trống cột "Mã NV cấy mô phụ trách" ở dòng ${staffRow.row}, hoặc tách kệ này thành 1 dòng duy nhất nếu muốn dedicate cho 1 NV` });
    }
  }

  // Sức chứa: tổng số lượng SAU khi ghi đè = số lượng các combo GIỮ NGUYÊN (không có trong targets) +
  // tổng targets — không được vượt capacity. Cần đọc lô hiện có (chỉ shelf mới có capacity, room luôn
  // capacity=null nên nhánh này chỉ chạy cho shelf).
  for (const g of groups.values()) {
    if (g.capacity == null || !g.shelfId) continue;
    const existingLots = await prisma.lot.findMany({
      where: { shelfId: g.shelfId, status: "ACTIVE" },
      select: { plantTypeId: true, stageCode: true, quantity: true },
    });
    const untouchedQuantity = existingLots
      .filter((l) => !g.targets.has(`${l.plantTypeId}::${l.stageCode}`))
      .reduce((s, l) => s + l.quantity, 0);
    const targetQuantity = [...g.targets.values()].reduce((s, t) => s + t.quantity, 0);
    const total = untouchedQuantity + targetQuantity;
    if (total > g.capacity) {
      const anyTarget = [...g.targets.values()][0];
      errors.push({
        row: anyTarget.source.row,
        label: g.label,
        message: `Vị trí ${g.label} không đủ sức chứa sau khi cập nhật (cần ${total.toLocaleString("vi-VN")}, tối đa ${g.capacity.toLocaleString("vi-VN")})`,
      });
    }
  }

  // ---- Giai đoạn 2: áp dụng — chỉ khi cả file không còn dòng lỗi nào ----
  let updatedCount = 0; // số lô được tạo mới hoặc sửa số lượng theo đúng combo khai trong file
  // zeroedCount: chỉ phát sinh trong trường hợp hiếm — 1 combo (vị trí + mã cây + quy cách) lỡ có NHIỀU
  // hơn 1 lô ACTIVE trùng nhau (dữ liệu cũ trước khi có quy tắc này) — lô dư (không phải lô cũ nhất) bị
  // đưa về 0 khi combo đó được ghi đè, KHÔNG liên quan gì tới việc combo có mặt hay không trong file.
  let zeroedCount = 0;
  if (groups.size > 0 && errors.length === 0) {
    const claimedLotCodes = new Set<string>();
    await prisma.$transaction(async (tx) => {
      for (const g of groups.values()) {
        const whereLoc = g.shelfId ? { shelfId: g.shelfId } : { roomId: g.roomId };
        const existingLots = await tx.lot.findMany({ where: { ...whereLoc, status: "ACTIVE" }, orderBy: { enteredAt: "asc" } });
        const existingByCombo = new Map<string, typeof existingLots>();
        for (const lot of existingLots) {
          const comboKey = `${lot.plantTypeId}::${lot.stageCode}`;
          const arr = existingByCombo.get(comboKey) ?? [];
          arr.push(lot);
          existingByCombo.set(comboKey, arr);
        }

        // Gán mã cây dedicate + NV phụ trách cho kệ Phòng mẫu mẹ — CHỈ khi đúng 1 dòng/kệ (kệ "đã chia"
        // hoặc đang dedicate lần đầu). Kệ "chung" nhiều mã cây (g.mauMeRows.length > 1, đã validate hợp
        // lệ ở Giai đoạn 1.5) rơi thẳng xuống vòng lặp targets bên dưới — không đụng plantTypeId/
        // assignedStaffId của Shelf, mỗi dòng chỉ là 1 lô riêng trên cùng 1 kệ chung.
        if (g.isMauMeShelf && g.mauMeRows.length === 1 && g.shelfId) {
          const vr = g.mauMeRows[0];
          const shelfCurrent = await tx.shelf.findUnique({ where: { id: g.shelfId }, select: { plantTypeId: true, assignedStaffId: true } });

          if (vr.clearMauMeShelf) {
            // Dòng "dọn trống kệ" (bỏ trống Mã cây) — chỉ xoá gán mã cây dedicate (GIỮ NGUYÊN NV phụ
            // trách, không đụng assignedStaffId), rồi đưa MỌI lô đang ACTIVE trên kệ về 0 — không chỉ
            // theo combo trong targets (targets rỗng vì dòng này không khai mã cây/quy cách nào), vì
            // "trống kệ" nghĩa là trống hết bất kể mã cây cũ trên đó là gì.
            if (shelfCurrent?.plantTypeId) {
              await tx.shelf.update({ where: { id: g.shelfId }, data: { plantTypeId: null } });
            }
            for (const lot of existingLots) {
              if (lot.quantity !== 0) {
                await tx.lot.update({ where: { id: lot.id }, data: { quantity: 0 } });
                updatedCount += 1;
              }
            }
            continue;
          }

          const attrResult = await resolveShelfAttributeUpdate(tx, g.shelfId, {
            plantTypeId: shelfCurrent && vr.plantType!.id === shelfCurrent.plantTypeId ? undefined : vr.plantType!.id,
            assignedStaffId: vr.resolvedStaffId && vr.resolvedStaffId !== shelfCurrent?.assignedStaffId ? vr.resolvedStaffId : undefined,
          });
          if (attrResult.ok && Object.keys(attrResult.data).length > 0) {
            await tx.shelf.update({ where: { id: g.shelfId }, data: attrResult.data });
          }
          // Lỗi ở đây (VD kệ còn lô mã cây khác còn ACTIVE) không nên xảy ra vì đã validate ở Giai đoạn 1
          // — bỏ qua silently nếu có lệch state hiếm gặp (2 lượt nhập trùng thời điểm), không rollback cả
          // batch vì lỗi chỉ ảnh hưởng đúng 2 field này, không ảnh hưởng số lượng.
        }

        // Combo hiện có nhưng KHÔNG xuất hiện trong file cho vị trí này → GIỮ NGUYÊN, không đụng tới.

        // Áp trạng thái đích: combo có trong file thì sửa lô hiện có (lấy lô CŨ NHẤT nếu lỡ có nhiều lô
        // trùng combo — các lô dư còn lại đưa về 0) hoặc tạo mới nếu chưa từng có.
        for (const [comboKey, target] of g.targets) {
          const existing = existingByCombo.get(comboKey) ?? [];
          if (existing.length > 0) {
            const [primary, ...rest] = existing;
            if (primary.quantity !== target.quantity) {
              await tx.lot.update({ where: { id: primary.id }, data: { quantity: target.quantity } });
              updatedCount += 1;
            }
            for (const dup of rest) {
              if (dup.quantity !== 0) {
                await tx.lot.update({ where: { id: dup.id }, data: { quantity: 0 } });
                zeroedCount += 1;
              }
            }
            continue;
          }

          if (target.quantity <= 0) continue; // chưa từng có lô + số lượng 0 → không có gì để tạo

          const vr = target.source;
          let code = target.lotCodeOverride;
          if (!code) {
            const base = lotCodeBase({ plantTypeCode: vr.plantType!.code, staffCode: vr.staffCode ?? "NV000", date: vr.enteredAt });
            let attempt = 0;
            for (;;) {
              attempt += 1;
              code = attempt === 1 ? base : `${base}-${attempt}`;
              const key = `${code}::${target.stageCode}`;
              if (attempt > MAX_CODE_ATTEMPTS) throw new Error(`Không sinh được mã lô duy nhất cho ${vr.label}`);
              if (claimedLotCodes.has(key)) continue;
              const existingCode = await tx.lot.findFirst({ where: { code, stageCode: target.stageCode }, select: { id: true } });
              if (existingCode) continue;
              claimedLotCodes.add(key);
              break;
            }
          }

          await tx.lot.create({
            data: {
              code: code!,
              plantTypeId: target.plantTypeId,
              stage: vr.lotStage,
              stageCode: target.stageCode,
              shelfId: g.shelfId,
              roomId: g.roomId,
              quantity: target.quantity,
              initialQuantity: target.quantity,
              status: "ACTIVE",
              enteredAt: vr.enteredAt,
              expectedMoveAt: vr.expectedMoveAt,
            },
          });
          updatedCount += 1;
        }
      }
    });
  }

  return NextResponse.json({ successCount: updatedCount, zeroedCount, errors });
}
