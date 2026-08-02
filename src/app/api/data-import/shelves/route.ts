import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { addWeeks } from "date-fns";
import { lotCodeBase } from "@/lib/codes";
import { cellText, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

const MAX_CODE_ATTEMPTS = 50;
// "Tên kệ" nhập theo định dạng gọn "{Hàng}{Số hàng 2 số}C{Số cột}" (VD "A01C09") — Mã kệ/Hàng-Block/Số
// hàng/Số cột đều tự suy ra từ đúng 1 giá trị này (xem parseShelfPosition), không cần nhập riêng từng
// cột nữa. Giống hệt quy ước code/block ở /api/shelves (form "Thêm giàn kệ" dạng lưới).
const SHELF_POSITION_PATTERN = /^([A-Za-z])(\d{1,2})C(\d{1,3})$/i;
function parseShelfPosition(raw: string): { block: string; rowNumber: number; colNumber: number; suffix: string } | null {
  const m = SHELF_POSITION_PATTERN.exec(raw.trim());
  if (!m) return null;
  const rowNumber = parseInt(m[2], 10);
  const colNumber = parseInt(m[3], 10);
  const block = `${m[1].toUpperCase()}${String(rowNumber).padStart(2, "0")}`;
  const suffix = `${block}C${String(colNumber).padStart(2, "0")}`;
  return { block, rowNumber, colNumber, suffix };
}
const ROOM_TYPE_LABEL_TO_ENUM = new Map<string, "PHONG_MAU_ME" | "PHONG_RA_RE">([
  ["phòng mẫu mẹ", "PHONG_MAU_ME"],
  ["phòng ra rễ", "PHONG_RA_RE"],
]);
const POOL_LABEL_TO_ENUM = new Map<string, "SHARED" | "ASSIGNED">([
  ["kho mẫu mẹ chung", "SHARED"],
  ["kho mẫu mẹ đã chia", "ASSIGNED"],
]);
const SHARED_POOL_LABEL_TO_ENUM = new Map<string, "QUA_HAN" | "DUNG_HAN">([
  ["quá hạn", "QUA_HAN"],
  ["đúng hạn", "DUNG_HAN"],
]);

type RowError = { row: number; label: string; message: string };

// Khác với /api/shelves/import (chỉ SỬA thuộc tính kệ đã tồn tại) — route này TẠO MỚI kệ, dành cho
// khu sản xuất/phòng vừa mở hoặc khi mã kệ không theo lưới đều (không dùng được form "Thêm giàn kệ"
// dạng lưới chữ hàng × số hàng × cột). KHÔNG cần chọn phòng trước trên web (khác bản trước) — mỗi dòng
// tự khai đủ Mã kho/Loại phòng/Phân loại kệ mẫu mẹ, nên 1 file có thể tạo kệ cho NHIỀU kho/phòng khác
// nhau cùng lúc, giống cách /api/data-import/lots dùng 1 cột vị trí chung cho mọi kệ/phòng.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel giàn kệ mới" }, { status: 403 });
  }

  const [warehouses, plantTypes, staff, rotationGroups] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true, type: "SAN_XUAT" }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({ where: { role: "CAY_MO", isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.shelfGroup.findMany({
      where: { rotationKind: { not: null } },
      select: { name: true, rotationKind: true },
      orderBy: [{ rotationKind: "asc" }, { rotationOrder: "asc" }],
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Giàn kệ mới");
  sheet.columns = [
    { header: "Mã kho sản xuất", key: "warehouseCode", width: 16 },
    { header: "Loại phòng (Phòng mẫu mẹ/Phòng ra rễ)", key: "roomType", width: 26 },
    { header: "Phân loại kệ (chỉ Phòng mẫu mẹ)", key: "pool", width: 26 },
    { header: "Kho quá hạn/đúng hạn (chỉ khi Phân loại = Kho mẫu mẹ chung)", key: "sharedPool", width: 32 },
    { header: "Tên kệ (VD: A01C09 — không cần gõ chữ \"Kệ\")", key: "position", width: 30 },
    { header: "Sức chứa (cụm ở Phòng mẫu mẹ / cây ở Phòng ra rễ)", key: "capacity", width: 30 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Mã NV phụ trách (bắt buộc nếu Phân loại = Kho mẫu mẹ đã chia)", key: "staffCode", width: 30 },
    { header: "Nhóm tuần", key: "rotationGroup", width: 18 },
    { header: "Số lượng M05 ban đầu", key: "quantityM05", width: 18 },
    { header: "Số lượng T01 ban đầu", key: "quantityT01", width: 18 },
    { header: "Số lượng T05 ban đầu", key: "quantityT05", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 5]);
  if (warehouses[0]) {
    sheet.addRow({
      warehouseCode: warehouses[0].code,
      roomType: "Phòng mẫu mẹ",
      pool: "Kho mẫu mẹ đã chia",
      position: "A01C01",
      capacity: 600,
      plantTypeCode: plantTypes[0]?.code ?? "MT001",
      staffCode: staff[0]?.code ?? "NVCM010",
      quantityM05: 300,
    });
    styleExampleRow(sheet.getRow(2));
  }

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 20 },
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên", key: "name", width: 30 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const w of warehouses) helpSheet.addRow({ type: "Mã kho sản xuất", code: w.code, name: w.name });
  for (const p of plantTypes) helpSheet.addRow({ type: "Mã cây", code: p.code, name: p.name });
  for (const s of staff) helpSheet.addRow({ type: "Mã NV", code: s.code, name: s.name });
  for (const g of rotationGroups) {
    helpSheet.addRow({ type: g.rotationKind === "MAU_ME" ? "Nhóm tuần (mẫu mẹ)" : "Nhóm tuần (ra rễ)", code: g.name, name: "" });
  }
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM kệ mới vào hệ thống — không xoá/thay đổi kệ đã có, kể cả khi file có lẫn dòng của lần tải trước." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tên kệ nhập theo định dạng {Hàng}{Số hàng 2 số}C{Số cột} (VD A01C09) — Mã kệ, Hàng/Block, Số hàng, Số cột đều TỰ SUY RA từ đúng giá trị này, không cần nhập riêng." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã kệ tự sinh (từ Tên kệ) phải CHƯA tồn tại — nếu muốn sửa kệ đã có, dùng \"Xuất/Nhập Excel\" ở trang Kho & Kệ." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Phân loại/Kho quá hạn-đúng hạn/Mã NV phụ trách chỉ áp dụng khi Loại phòng = Phòng mẫu mẹ — bỏ trống ở Phòng ra rễ." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "1 dòng có thể điền nhiều cột Số lượng cùng lúc (VD cả T01 lẫn T05 cho Phòng ra rễ) để tạo đồng thời nhiều lô cho 1 kệ mới, miễn tổng không vượt Sức chứa." });

  addGuideSheet(workbook, [
    { column: "Mã kho sản xuất", required: true, description: "Mã kho sản xuất đang hoạt động, xem sheet Danh mục." },
    { column: "Loại phòng (Phòng mẫu mẹ/Phòng ra rễ)", required: true, description: 'Đúng 1 trong 2 giá trị: "Phòng mẫu mẹ" hoặc "Phòng ra rễ".' },
    { column: "Phân loại kệ (chỉ Phòng mẫu mẹ)", required: false, description: '"Kho mẫu mẹ chung" hoặc "Kho mẫu mẹ đã chia" — chỉ áp dụng khi Loại phòng = Phòng mẫu mẹ.' },
    { column: "Kho quá hạn/đúng hạn (chỉ khi Phân loại = Kho mẫu mẹ chung)", required: false, description: '"Quá hạn" hoặc "Đúng hạn" — chỉ điền khi Phân loại = Kho mẫu mẹ chung.' },
    { column: "Tên kệ (VD: A01C09)", required: true, description: "Định dạng {Hàng}{Số hàng 2 số}C{Số cột}, VD A01C09 — Mã kệ/Hàng-Block/Số hàng/Số cột tự suy ra từ đây." },
    { column: "Sức chứa (cụm ở Phòng mẫu mẹ / cây ở Phòng ra rễ)", required: false, description: "Số nguyên dương. Để trống = không giới hạn." },
    { column: "Mã cây", required: false, description: "Bắt buộc nếu có điền Số lượng ban đầu ở các cột sau." },
    { column: "Mã NV phụ trách (bắt buộc nếu Phân loại = Kho mẫu mẹ đã chia)", required: false, description: "Mã NV Cấy mô — bắt buộc khi Phân loại kệ = Kho mẫu mẹ đã chia." },
    { column: "Nhóm tuần", required: false, description: "Tên Nhóm giàn kệ xoay vòng đã tạo trước (xem sheet Danh mục), đúng loại (mẫu mẹ/ra rễ) theo Loại phòng." },
    { column: "Số lượng M05/T01/T05 ban đầu", required: false, description: "Có thể điền nhiều cột cùng lúc để tạo đồng thời nhiều lô cho 1 kệ mới — tổng không vượt Sức chứa. M05 chỉ dùng cho Phòng mẫu mẹ, T01/T05 chỉ dùng cho Phòng ra rễ." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-gian-ke-moi.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel giàn kệ mới" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Giàn kệ mới") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    warehouseCode: string;
    roomTypeText: string;
    poolText?: string;
    sharedPoolText?: string;
    position: string;
    capacity?: string;
    plantTypeCode?: string;
    staffCode?: string;
    rotationGroupName?: string;
    quantityM05?: string;
    quantityT01?: string;
    quantityT05?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const position = cellText(row.getCell(5).value);
    if (!position) return;
    parsedRows.push({
      row: rowNumber,
      warehouseCode: cellText(row.getCell(1).value),
      roomTypeText: cellText(row.getCell(2).value),
      poolText: cellText(row.getCell(3).value) || undefined,
      sharedPoolText: cellText(row.getCell(4).value) || undefined,
      position,
      capacity: cellText(row.getCell(6).value) || undefined,
      plantTypeCode: cellText(row.getCell(7).value) || undefined,
      staffCode: cellText(row.getCell(8).value) || undefined,
      rotationGroupName: cellText(row.getCell(9).value) || undefined,
      quantityM05: cellText(row.getCell(10).value) || undefined,
      quantityT01: cellText(row.getCell(11).value) || undefined,
      quantityT05: cellText(row.getCell(12).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const rotationGroups = await prisma.shelfGroup.findMany({
    where: { rotationKind: { not: null } },
    select: { id: true, name: true, rotationOrder: true, rotationKind: true },
  });
  const rotationGroupsByKindAndName = new Map<string, { id: string; rotationOrder: number | null }[]>();
  for (const g of rotationGroups) {
    const key = `${g.rotationKind}::${g.name}`;
    const list = rotationGroupsByKindAndName.get(key) ?? [];
    list.push({ id: g.id, rotationOrder: g.rotationOrder });
    rotationGroupsByKindAndName.set(key, list);
  }

  type ResolvedPlantType = { id: string; code: string; transferWaitWeeks: number; rootingWeeks: number };
  type ValidRow = {
    row: number;
    code: string;
    name: string;
    warehouseId: string;
    roomId: string;
    isMauMe: boolean;
    block: string;
    rowNumber: number;
    colNumber: number;
    capacity?: number;
    plantTypeId?: string;
    assignedStaffId?: string;
    sharedMotherPool?: "QUA_HAN" | "DUNG_HAN";
    rotationGroupId?: string;
    stageEntries: { stageCode: string; quantity: number }[];
    plantType?: ResolvedPlantType;
    staffCode?: string | null;
    // Có giá trị khi mã kệ trùng với 1 kệ đã bị xóa (isActive: false) — xóa kệ hiện tại là xóa mềm nên
    // code (unique) vẫn còn bị chiếm, không thể tạo hàng mới cùng mã; phải hồi sinh (update) đúng hàng cũ
    // đó thay vì tạo mới, và ghi đè lại toàn bộ thuộc tính theo dữ liệu trong file (coi như tạo lại từ đầu).
    reactivateShelfId?: string;
  };

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedShelfCodes = new Set<string>();

  for (const parsed of parsedRows) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { code: parsed.warehouseCode, type: "SAN_XUAT", isActive: true },
      select: { id: true },
    });
    if (!warehouse) {
      errors.push({ row: parsed.row, label: parsed.position, message: `Không tìm thấy mã kho sản xuất "${parsed.warehouseCode}"` });
      continue;
    }

    const roomType = ROOM_TYPE_LABEL_TO_ENUM.get(parsed.roomTypeText.toLowerCase());
    if (!roomType) {
      errors.push({ row: parsed.row, label: parsed.position, message: `Loại phòng "${parsed.roomTypeText}" không hợp lệ (Phòng mẫu mẹ/Phòng ra rễ)` });
      continue;
    }
    const isMauMe = roomType === "PHONG_MAU_ME";
    const room = await prisma.room.findFirst({ where: { warehouseId: warehouse.id, type: roomType }, select: { id: true, code: true } });
    if (!room) {
      errors.push({ row: parsed.row, label: parsed.position, message: `Kho "${parsed.warehouseCode}" không có ${parsed.roomTypeText}` });
      continue;
    }

    // Tên kệ = "{Hàng}{Số hàng 2 số}C{Số cột}" (VD "A01C09") — tự suy ra Mã kệ/Hàng-Block/Số hàng/Số cột.
    const position = parseShelfPosition(parsed.position);
    if (!position) {
      errors.push({ row: parsed.row, label: parsed.position, message: `Tên kệ "${parsed.position}" không đúng định dạng (VD: A01C09)` });
      continue;
    }
    const code = `${room.code}-${position.suffix}`;
    const name = `Kệ ${position.suffix}`;

    if (claimedShelfCodes.has(code)) {
      errors.push({ row: parsed.row, label: parsed.position, message: "Tên kệ trùng với 1 dòng khác trong file" });
      continue;
    }
    const existing = await prisma.shelf.findUnique({ where: { code }, select: { id: true, isActive: true } });
    if (existing?.isActive) {
      errors.push({
        row: parsed.row,
        label: parsed.position,
        message: `Kệ ${code} đã tồn tại — dùng "Xuất/Nhập Excel" ở trang Kho & Kệ nếu muốn sửa kệ này`,
      });
      continue;
    }

    let capacityVal: number | undefined;
    if (parsed.capacity) {
      const n = Number(parsed.capacity);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        errors.push({ row: parsed.row, label: parsed.position, message: "Sức chứa phải là số nguyên dương" });
        continue;
      }
      capacityVal = n;
    }

    let resolvedPlantType: ResolvedPlantType | undefined;
    if (parsed.plantTypeCode) {
      const pt = await prisma.plantType.findUnique({
        where: { code: parsed.plantTypeCode },
        select: { id: true, code: true, transferWaitWeeks: true, rootingWeeks: true },
      });
      if (!pt) {
        errors.push({ row: parsed.row, label: parsed.position, message: `Không tìm thấy mã cây "${parsed.plantTypeCode}"` });
        continue;
      }
      resolvedPlantType = pt;
    }

    let resolvedStaffId: string | undefined;
    let resolvedStaffCode: string | null = null;
    if (parsed.staffCode) {
      const u = await prisma.user.findUnique({ where: { code: parsed.staffCode }, select: { id: true, role: true, code: true } });
      if (!u || u.role !== "CAY_MO") {
        errors.push({ row: parsed.row, label: parsed.position, message: `Không tìm thấy mã NV cấy mô "${parsed.staffCode}"` });
        continue;
      }
      resolvedStaffId = u.id;
      resolvedStaffCode = u.code;
    }

    // Phân loại kệ mẫu mẹ (Kho mẫu mẹ chung / Kho mẫu mẹ đã chia) — chỉ có ý nghĩa ở Phòng mẫu mẹ, giống
    // hệt quy tắc showPoolSection trong add-shelves-dialog.tsx (form "Thêm giàn kệ" thủ công).
    let assignedStaffId: string | undefined;
    let sharedMotherPool: "QUA_HAN" | "DUNG_HAN" | undefined;
    if (parsed.poolText) {
      if (!isMauMe) {
        errors.push({ row: parsed.row, label: parsed.position, message: "Phân loại kệ chỉ áp dụng cho Phòng mẫu mẹ" });
        continue;
      }
      const pool = POOL_LABEL_TO_ENUM.get(parsed.poolText.toLowerCase());
      if (!pool) {
        errors.push({ row: parsed.row, label: parsed.position, message: `Phân loại kệ "${parsed.poolText}" không hợp lệ (Kho mẫu mẹ chung/Kho mẫu mẹ đã chia)` });
        continue;
      }
      if (pool === "ASSIGNED") {
        if (!resolvedStaffId) {
          errors.push({ row: parsed.row, label: parsed.position, message: "Cần Mã NV phụ trách khi Phân loại = Kho mẫu mẹ đã chia" });
          continue;
        }
        assignedStaffId = resolvedStaffId;
      } else if (parsed.sharedPoolText) {
        const shared = SHARED_POOL_LABEL_TO_ENUM.get(parsed.sharedPoolText.toLowerCase());
        if (!shared) {
          errors.push({ row: parsed.row, label: parsed.position, message: `Kho quá hạn/đúng hạn "${parsed.sharedPoolText}" không hợp lệ (Quá hạn/Đúng hạn)` });
          continue;
        }
        sharedMotherPool = shared;
      }
    }

    let rotationGroupId: string | undefined;
    if (parsed.rotationGroupName) {
      const rotationKind = isMauMe ? "MAU_ME" : "RA_RE";
      const matches = rotationGroupsByKindAndName.get(`${rotationKind}::${parsed.rotationGroupName}`);
      if (!matches || matches.length === 0) {
        errors.push({ row: parsed.row, label: parsed.position, message: `Không tìm thấy Nhóm tuần "${parsed.rotationGroupName}"` });
        continue;
      }
      if (matches.length > 1) {
        errors.push({
          row: parsed.row,
          label: parsed.position,
          message: `Tên Nhóm tuần "${parsed.rotationGroupName}" trùng nhiều nhóm — đổi tên cho duy nhất trước khi nhập`,
        });
        continue;
      }
      const group = matches[0];
      if (isMauMe) {
        if (!resolvedPlantType) {
          errors.push({ row: parsed.row, label: parsed.position, message: "Cần Mã cây trước khi xếp vào Nhóm tuần mẫu mẹ" });
          continue;
        }
        if (group.rotationOrder !== null && group.rotationOrder > resolvedPlantType.transferWaitWeeks) {
          errors.push({
            row: parsed.row,
            label: parsed.position,
            message: `Nhóm khe ${group.rotationOrder} vượt quá "Thời gian đợi cấy chuyển" (${resolvedPlantType.transferWaitWeeks} tuần) của mã cây ${resolvedPlantType.code}`,
          });
          continue;
        }
      }
      rotationGroupId = group.id;
    }

    // Mỗi quy cách có 1 cột số lượng riêng — 1 dòng có thể điền nhiều cột để tạo đồng thời nhiều lô cho
    // 1 kệ mới. Cột không thuộc đúng loại phòng (VD điền T01 cho 1 dòng Phòng mẫu mẹ) coi là lỗi nhập
    // nhầm cột, báo rõ thay vì âm thầm bỏ qua.
    const wrongRoomStageCols: [string, string | undefined][] = isMauMe
      ? [["T01", parsed.quantityT01], ["T05", parsed.quantityT05]]
      : [["M05", parsed.quantityM05]];
    const wrongFilled = wrongRoomStageCols.find(([, raw]) => !!raw);
    if (wrongFilled) {
      errors.push({
        row: parsed.row,
        label: parsed.position,
        message: `Cột Số lượng ${wrongFilled[0]} không dùng được cho ${isMauMe ? "Phòng mẫu mẹ" : "Phòng ra rễ"}`,
      });
      continue;
    }

    const ownRoomStageCols: [string, string | undefined][] = isMauMe
      ? [["M05", parsed.quantityM05]]
      : [["T01", parsed.quantityT01], ["T05", parsed.quantityT05]];
    const stageEntries: { stageCode: string; quantity: number }[] = [];
    let stageError = false;
    for (const [stageCode, raw] of ownRoomStageCols) {
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
        errors.push({ row: parsed.row, label: parsed.position, message: `Số lượng ${stageCode} ban đầu phải là số nguyên dương` });
        stageError = true;
        break;
      }
      stageEntries.push({ stageCode, quantity: n });
    }
    if (stageError) continue;

    if (stageEntries.length > 0) {
      if (!resolvedPlantType) {
        errors.push({ row: parsed.row, label: parsed.position, message: "Cần Mã cây để tạo lô ban đầu cho kệ này" });
        continue;
      }
      const totalQuantity = stageEntries.reduce((sum, e) => sum + e.quantity, 0);
      if (capacityVal !== undefined && totalQuantity > capacityVal) {
        errors.push({
          row: parsed.row,
          label: parsed.position,
          message: `Tổng số lượng ban đầu (${totalQuantity}) vượt quá sức chứa kệ (${capacityVal} ${isMauMe ? "cụm" : "cây"})`,
        });
        continue;
      }
    }

    claimedShelfCodes.add(code);
    validRows.push({
      row: parsed.row,
      code,
      name,
      warehouseId: warehouse.id,
      roomId: room.id,
      isMauMe,
      block: position.block,
      rowNumber: position.rowNumber,
      colNumber: position.colNumber,
      capacity: capacityVal,
      plantTypeId: isMauMe && assignedStaffId ? resolvedPlantType?.id : undefined,
      assignedStaffId,
      sharedMotherPool,
      rotationGroupId,
      stageEntries,
      plantType: resolvedPlantType,
      staffCode: resolvedStaffCode,
      reactivateShelfId: existing?.id,
    });
  }

  // ---- Giai đoạn 2: tạo hàng loạt trong 1 transaction — chỉ khi cả file không còn dòng lỗi nào ----
  let successCount = 0;
  if (validRows.length > 0 && errors.length === 0) {
    const claimedLotCodes = new Set<string>();
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        const shelfData = {
          name: vr.name,
          warehouseId: vr.warehouseId,
          roomId: vr.roomId,
          rowNumber: vr.rowNumber,
          colNumber: vr.colNumber,
          block: vr.block,
          capacity: vr.capacity,
          plantTypeId: vr.plantTypeId,
          assignedStaffId: vr.assignedStaffId,
          sharedMotherPool: vr.sharedMotherPool,
          rotationGroupId: vr.rotationGroupId,
        };
        // Mã trùng 1 kệ đã bị xóa mềm (isActive: false) — hồi sinh đúng hàng đó (reset lại mọi thuộc
        // tính theo dữ liệu file, kể cả groupId/allowedCodes vốn không nằm trong form nhập) thay vì tạo
        // hàng mới, vì code là unique constraint nên không thể có 2 hàng cùng mã dù hàng cũ đã ẩn.
        const shelf = vr.reactivateShelfId
          ? await tx.shelf.update({
              where: { id: vr.reactivateShelfId },
              data: { ...shelfData, isActive: true, groupId: null, allowedCodes: [] },
            })
          : await tx.shelf.create({ data: { code: vr.code, ...shelfData } });

        if (vr.plantType) {
          for (const entry of vr.stageEntries) {
            const base = lotCodeBase({ plantTypeCode: vr.plantType.code, staffCode: vr.staffCode ?? "NV000" });
            let attempt = 0;
            let code = base;
            for (;;) {
              attempt += 1;
              code = attempt === 1 ? base : `${base}-${attempt}`;
              const key = `${code}::${entry.stageCode}`;
              if (attempt > MAX_CODE_ATTEMPTS) throw new Error(`Không sinh được mã lô duy nhất cho kệ ${vr.code}`);
              if (claimedLotCodes.has(key)) continue;
              const existingLot = await tx.lot.findFirst({ where: { code, stageCode: entry.stageCode }, select: { id: true } });
              if (existingLot) continue;
              claimedLotCodes.add(key);
              break;
            }
            await tx.lot.create({
              data: {
                code,
                plantTypeId: vr.plantType.id,
                stage: vr.isMauMe ? "MAU_ME" : "THANH_PHAM",
                stageCode: entry.stageCode,
                shelfId: shelf.id,
                quantity: entry.quantity,
                initialQuantity: entry.quantity,
                status: "ACTIVE",
                enteredAt: new Date(),
                // Mẫu mẹ: không còn tính expectedMoveAt từ ngày vào kệ — hạn cấy chuyển tự tính theo
                // Nhóm tuần mẫu mẹ của giàn kệ đích (xem summarizeMotherWeekGroups), giàn chưa gán Nhóm
                // thì không có hạn.
                expectedMoveAt: vr.isMauMe ? null : addWeeks(new Date(), vr.plantType.rootingWeeks),
              },
            });
          }
        }

        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
