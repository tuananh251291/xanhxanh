import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getFinishedQualifiedRooms } from "@/lib/processing";
import { createPlannedGoodsReceipt } from "@/lib/goods-receipt";
import { cellText, cellNumber, cellDate, markRequiredHeaders, styleExampleRow, addGuideSheet } from "@/lib/excel-import";
import ExcelJS from "exceljs";
import { ALL_FINISHED_STAGE_CODES } from "@/types";

const STAGE_CODES: string[] = ALL_FINISHED_STAGE_CODES;

function isKhoThanhPham(role: string | null | undefined) {
  return role === "KHO_THANH_PHAM" || role === "QUAN_LY_KHO_THANH_PHAM";
}

const SHEET_NAME = "Dự kiến nhập hàng";
const LEGACY_SHEET_NAME = "Kế hoạch nhập kho"; // tên sheet của file mẫu cũ — vẫn nhận

// Mẫu Excel "Dự kiến nhập hàng" — mỗi dòng = 1 (mã hàng, quy cách) của 1 lần hàng về; nhiều dòng cùng
// đơn vị cung cấp + Ngày hàng về được gộp thành 1 phiếu (xem POST bên dưới), khác form thủ công chỉ
// tạo được 1 phiếu/lần. Đơn vị cung cấp = mã NCC ngoài HOẶC mã Khu SX nội bộ (giống combobox ở form tay).
export async function GET() {
  const session = await auth();
  if (!isKhoThanhPham(session?.user?.role)) {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }

  const [suppliers, gardens, plantTypes] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.productionGarden.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [
    { header: "Mã NCC / Khu SX", key: "supplierCode", width: 18 },
    { header: "Mã hàng", key: "plantTypeCode", width: 14 },
    { header: "Quy cách", key: "stageCode", width: 12 },
    { header: "Số lượng", key: "quantity", width: 12 },
    { header: "Ngày hàng về", key: "expectedDate", width: 16 },
    { header: "Ghi chú", key: "notes", width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3, 4, 5]);
  sheet.addRow({
    supplierCode: suppliers[0]?.code ?? "NCC01",
    plantTypeCode: plantTypes[0]?.code ?? "MT001",
    stageCode: "T01",
    quantity: 100,
    expectedDate: "01/09/2026",
    notes: "VD: ghi chú tuỳ chọn cho phiếu",
  });
  styleExampleRow(sheet.getRow(2));

  const lookupSheet = workbook.addWorksheet("Danh mục");
  lookupSheet.columns = [
    { header: "Loại", key: "kind", width: 12 },
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên", key: "name", width: 30 },
  ];
  lookupSheet.getRow(1).font = { bold: true };
  for (const s of suppliers) lookupSheet.addRow({ kind: "Nhà cung cấp", code: s.code, name: s.name });
  for (const g of gardens) lookupSheet.addRow({ kind: "Khu SX nội bộ", code: g.code, name: g.name });
  for (const p of plantTypes) lookupSheet.addRow({ kind: "Loại cây", code: p.code, name: p.name });

  addGuideSheet(workbook, [
    { column: "Mã NCC / Khu SX", required: true, description: "Mã nhà cung cấp hoặc mã Khu SX nội bộ đã có trong hệ thống — xem sheet Danh mục." },
    { column: "Mã hàng", required: true, description: "Mã loại cây đã có trong hệ thống — xem sheet Danh mục." },
    { column: "Quy cách", required: true, description: "T01 (túi 1 cây) / T05 (túi 5 cây) / T06 (túi 6 cây) / T10 (túi 10 cây) / T20 (túi 20 cây) / T25 (túi 25 cây)." },
    { column: "Số lượng", required: true, description: "Số nguyên dương." },
    {
      column: "Ngày hàng về",
      required: true,
      description: "Định dạng dd/mm/yyyy — nhiệm vụ chỉ xuất hiện trên bảng công việc của NV được gán đúng ngày này trở đi.",
    },
    {
      column: "Ghi chú",
      required: false,
      description: "Ghi chú cho phiếu — nếu nhiều dòng cùng Mã NCC/Khu SX + Ngày hàng về có ghi chú khác nhau, hệ thống lấy ghi chú của dòng đầu tiên.",
    },
    {
      column: "Cách gộp phiếu",
      required: false,
      description: "Các dòng cùng Mã NCC/Khu SX + Ngày hàng về được gộp thành 1 phiếu dự kiến nhập hàng. File có lỗi ở bất kỳ dòng nào sẽ không tạo phiếu nào — sửa hết lỗi rồi tải lại. Dòng 2 (dòng ví dụ tô màu) luôn bị bỏ qua.",
    },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-du-kien-nhap-hang.xlsx"`,
    },
  });
}

type RowError = { row: number; label: string; message: string };
type ParsedRow = {
  row: number;
  supplierId: string | null;
  productionGardenId: string | null;
  supplierCode: string;
  plantTypeId: string;
  plantTypeCode: string;
  stageCode: string;
  quantity: number;
  expectedDate: Date;
  notes: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isKhoThanhPham(session?.user?.role)) {
    return NextResponse.json({ message: "Chỉ NV kho thành phẩm mới dùng được chức năng này" }, { status: 403 });
  }
  if (!session!.user.workplaceWarehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán địa điểm làm việc (kho thành phẩm) — liên hệ Admin cấp cao" }, { status: 400 });
  }
  const workplaceWarehouseId = session!.user.workplaceWarehouseId;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.getWorksheet(LEGACY_SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "File không có sheet dữ liệu" }, { status: 400 });

  const [suppliers, gardens, plantTypes, room, creatingUser] = await Promise.all([
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    prisma.productionGarden.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true } }),
    getFinishedQualifiedRooms().then((rooms) => rooms.find((r) => r.warehouseId === workplaceWarehouseId) ?? null),
    prisma.user.findUnique({ where: { id: session!.user.id }, select: { code: true } }),
  ]);
  if (!room) {
    return NextResponse.json({ message: "Kho thành phẩm bạn đang làm việc chưa có Phòng đạt tiêu chuẩn — liên hệ Admin tạo phòng trước" }, { status: 400 });
  }
  const supplierByCode = new Map(suppliers.map((s) => [s.code.toUpperCase(), s]));
  const gardenByCode = new Map(gardens.map((g) => [g.code.toUpperCase(), g]));
  const plantTypeByCode = new Map(plantTypes.map((p) => [p.code.toUpperCase(), p]));
  const staffCode = creatingUser?.code ?? "000";

  const errors: RowError[] = [];
  const parsedRows: ParsedRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = dòng ví dụ — luôn bỏ qua.
    const supplierCode = cellText(row.getCell(1).value);
    const plantTypeCode = cellText(row.getCell(2).value);
    const stageCode = cellText(row.getCell(3).value).toUpperCase();
    const quantity = cellNumber(row.getCell(4).value);
    const expectedDate = cellDate(row.getCell(5).value);
    const notes = cellText(row.getCell(6).value);
    if (!supplierCode && !plantTypeCode && quantity === undefined) return; // dòng trống — bỏ qua.

    const label = `${supplierCode || "?"} · ${plantTypeCode || "?"}`;
    if (!supplierCode) { errors.push({ row: rowNumber, label, message: "Thiếu Mã NCC / Khu SX" }); return; }
    // Ưu tiên NCC ngoài nếu (hiếm) trùng mã với 1 Khu SX nội bộ.
    const supplier = supplierByCode.get(supplierCode.toUpperCase());
    const garden = supplier ? undefined : gardenByCode.get(supplierCode.toUpperCase());
    if (!supplier && !garden) { errors.push({ row: rowNumber, label, message: `Không tìm thấy nhà cung cấp / Khu SX "${supplierCode}"` }); return; }

    if (!plantTypeCode) { errors.push({ row: rowNumber, label, message: "Thiếu Mã hàng" }); return; }
    const plantType = plantTypeByCode.get(plantTypeCode.toUpperCase());
    if (!plantType) { errors.push({ row: rowNumber, label, message: `Không tìm thấy loại cây "${plantTypeCode}"` }); return; }

    if (!STAGE_CODES.includes(stageCode)) { errors.push({ row: rowNumber, label, message: "Quy cách phải là T01, T05, T06, T10, T20 hoặc T25" }); return; }

    if (quantity === undefined) { errors.push({ row: rowNumber, label, message: "Thiếu Số lượng" }); return; }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push({ row: rowNumber, label, message: "Số lượng phải là số nguyên dương" }); return;
    }

    if (expectedDate === undefined) { errors.push({ row: rowNumber, label, message: "Thiếu Ngày hàng về" }); return; }
    if (expectedDate === null) { errors.push({ row: rowNumber, label, message: "Ngày hàng về không hợp lệ — dùng định dạng dd/mm/yyyy" }); return; }

    parsedRows.push({
      row: rowNumber,
      supplierId: supplier?.id ?? null,
      productionGardenId: garden?.id ?? null,
      supplierCode: (supplier ?? garden)!.code,
      plantTypeId: plantType.id,
      plantTypeCode: plantType.code,
      stageCode,
      quantity,
      expectedDate,
      notes,
    });
  });

  if (errors.length > 0) return NextResponse.json({ successCount: 0, errors });
  if (parsedRows.length === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });

  // Gộp các dòng cùng đơn vị cung cấp + Ngày hàng về (theo ngày, không theo giờ) thành 1 phiếu dự kiến.
  type Group = { supplierId: string | null; productionGardenId: string | null; expectedDate: Date; notes?: string; items: ParsedRow[] };
  const groups = new Map<string, Group>();
  for (const r of parsedRows) {
    const dateKey = r.expectedDate.toISOString().slice(0, 10);
    const key = `${r.supplierId ? `s:${r.supplierId}` : `g:${r.productionGardenId}`}::${dateKey}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(r);
      if (!group.notes && r.notes) group.notes = r.notes;
    } else {
      groups.set(key, { supplierId: r.supplierId, productionGardenId: r.productionGardenId, expectedDate: r.expectedDate, notes: r.notes || undefined, items: [r] });
    }
  }

  const createdCodes = await prisma.$transaction(async (tx) => {
    const codes: string[] = [];
    for (const group of groups.values()) {
      const receipt = await createPlannedGoodsReceipt(tx, {
        supplierId: group.supplierId ?? undefined,
        productionGardenId: group.productionGardenId ?? undefined,
        roomId: room.id,
        createdById: session!.user.id,
        notes: group.notes,
        expectedDate: group.expectedDate,
        staffCode,
        items: group.items.map((i) => ({
          plantTypeId: i.plantTypeId,
          plantTypeCode: i.plantTypeCode,
          stageCode: i.stageCode,
          estimatedQuantity: i.quantity,
        })),
      });
      codes.push(receipt.code);
    }
    return codes;
  });

  return NextResponse.json({
    successCount: parsedRows.length,
    receiptCount: createdCodes.length,
    summary: `Đã tạo ${createdCodes.length} phiếu dự kiến nhập hàng từ ${parsedRows.length} dòng: ${createdCodes.join(", ")}`,
    errors: [],
  });
}
