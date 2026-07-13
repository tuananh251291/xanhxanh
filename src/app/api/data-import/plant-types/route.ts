import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { cellText, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

type RowError = { row: number; label: string; message: string };

// Nhập hàng loạt LOẠI CÂY MỚI (PlantCategory + PlantType) — khu sản xuất mới thường trồng thêm mã cây
// chưa từng khai báo, mà Module "Giàn kệ mới"/"Lô tồn kho hiện có"/"Chỉ định cấy" đều bắt buộc chọn mã
// cây đã tồn tại. Không có bảng "tỉ lệ quy cách mặc định" riêng (PlantType không lưu tỉ lệ nhân mẫu
// mẹ/ra rễ — KY_THUAT tự nhập theo thực tế mỗi lần tạo chỉ định, xem PlantingInstructionItem), nên
// module này chỉ cần tạo PlantCategory (Loại cây cha, tự tạo nếu chưa có) + PlantType (chi tiết loại
// cây, mã = category.code + 3 ký tự tự chọn — giống hệt quy tắc POST /api/plant-types).
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel loại cây" }, { status: 403 });
  }

  const categories = await prisma.plantCategory.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Loại cây mới");
  sheet.columns = [
    { header: "Mã Loại cây cha (2-3 ký tự)", key: "categoryCode", width: 20 },
    { header: "Tên Loại cây cha (chỉ cần nếu Mã cha chưa có)", key: "categoryName", width: 30 },
    { header: "Mã chi tiết (3 ký tự)", key: "codeSuffix", width: 16 },
    { header: "Tên cây", key: "name", width: 24 },
    { header: "Mô tả", key: "description", width: 26 },
    { header: "Thời gian đợi cấy chuyển (tuần, tối đa 6)", key: "transferWaitWeeks", width: 26 },
    { header: "Thời gian ra rễ (tuần)", key: "rootingWeeks", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 3, 4]);
  sheet.addRow({ categoryCode: "MT", categoryName: "Monstera", codeSuffix: "001", name: "Monstera Deliciosa", description: "Cây cảnh lá xẻ", transferWaitWeeks: 4, rootingWeeks: 3 });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 18 },
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên", key: "name", width: 26 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const c of categories) helpSheet.addRow({ type: "Loại cây cha có sẵn", code: c.code, name: c.name });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM mã cây mới — không xoá/sửa mã cây đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã đầy đủ của cây = Mã Loại cây cha + Mã chi tiết, VD MT + 001 = MT001." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã Loại cây cha chưa có trong hệ thống sẽ tự tạo mới — bắt buộc điền kèm Tên Loại cây cha khi đó." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Để trống Thời gian đợi cấy chuyển/ra rễ = mặc định 4/3 tuần." });

  addGuideSheet(workbook, [
    { column: "Mã Loại cây cha (2-3 ký tự)", required: true, description: "2-3 chữ cái. Nếu chưa tồn tại, hệ thống tự tạo mới Loại cây cha (cần điền kèm Tên Loại cây cha)." },
    { column: "Tên Loại cây cha (chỉ cần nếu Mã cha chưa có)", required: false, description: "Chỉ bắt buộc khi Mã Loại cây cha chưa tồn tại trong hệ thống." },
    { column: "Mã chi tiết (3 ký tự)", required: true, description: "Đúng 3 ký tự chữ/số. Mã đầy đủ của cây = Mã Loại cây cha + Mã chi tiết (VD MT + 001 = MT001)." },
    { column: "Tên cây", required: true, description: "Tên hiển thị của mã cây, tối thiểu 2 ký tự." },
    { column: "Mô tả", required: false, description: "Ghi chú tự do về mã cây." },
    { column: "Thời gian đợi cấy chuyển (tuần, tối đa 6)", required: false, description: "Số nguyên 1-6. Để trống = mặc định 4 tuần." },
    { column: "Thời gian ra rễ (tuần)", required: false, description: "Số nguyên dương. Để trống = mặc định 3 tuần." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-loai-cay-moi.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel loại cây" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Loại cây mới") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    categoryCode: string;
    categoryName?: string;
    codeSuffix: string;
    name: string;
    description?: string;
    transferWaitWeeks?: string;
    rootingWeeks?: string;
  };
  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const categoryCode = cellText(row.getCell(1).value);
    if (!categoryCode) return;
    parsedRows.push({
      row: rowNumber,
      categoryCode: categoryCode.toUpperCase(),
      categoryName: cellText(row.getCell(2).value) || undefined,
      codeSuffix: cellText(row.getCell(3).value).toUpperCase(),
      name: cellText(row.getCell(4).value),
      description: cellText(row.getCell(5).value) || undefined,
      transferWaitWeeks: cellText(row.getCell(6).value) || undefined,
      rootingWeeks: cellText(row.getCell(7).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  type ValidRow = {
    row: number;
    label: string;
    categoryCode: string;
    categoryName?: string;
    code: string;
    name: string;
    description?: string;
    transferWaitWeeks: number;
    rootingWeeks: number;
  };
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedCategoryCreations = new Map<string, string>(); // categoryCode -> categoryName dùng để tạo trong batch
  const claimedFullCodes = new Set<string>();

  for (const parsed of parsedRows) {
    if (!/^[A-Z]{2,3}$/.test(parsed.categoryCode)) {
      errors.push({ row: parsed.row, label: parsed.categoryCode, message: "Mã Loại cây cha phải gồm 2-3 chữ cái" });
      continue;
    }
    if (!/^[A-Z0-9]{3}$/.test(parsed.codeSuffix)) {
      errors.push({ row: parsed.row, label: parsed.categoryCode, message: "Mã chi tiết phải đúng 3 ký tự chữ/số" });
      continue;
    }
    if (!parsed.name || parsed.name.length < 2) {
      errors.push({ row: parsed.row, label: parsed.categoryCode, message: "Thiếu Tên cây" });
      continue;
    }

    const fullCode = `${parsed.categoryCode}${parsed.codeSuffix}`;
    if (claimedFullCodes.has(fullCode)) {
      errors.push({ row: parsed.row, label: fullCode, message: "Mã cây trùng với 1 dòng khác trong file" });
      continue;
    }
    const existingType = await prisma.plantType.findUnique({ where: { code: fullCode }, select: { id: true } });
    if (existingType) {
      errors.push({ row: parsed.row, label: fullCode, message: `Mã cây "${fullCode}" đã tồn tại` });
      continue;
    }

    const category = await prisma.plantCategory.findUnique({ where: { code: parsed.categoryCode }, select: { id: true } });
    if (!category) {
      const pendingName = claimedCategoryCreations.get(parsed.categoryCode);
      if (!pendingName && !parsed.categoryName) {
        errors.push({
          row: parsed.row,
          label: parsed.categoryCode,
          message: `Chưa có Loại cây cha "${parsed.categoryCode}" — cần điền Tên Loại cây cha để tự tạo mới`,
        });
        continue;
      }
      claimedCategoryCreations.set(parsed.categoryCode, pendingName ?? parsed.categoryName!);
    }

    let transferWaitWeeks = 4;
    if (parsed.transferWaitWeeks) {
      const n = Number(parsed.transferWaitWeeks);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 6) {
        errors.push({ row: parsed.row, label: fullCode, message: "Thời gian đợi cấy chuyển phải là số nguyên 1-6" });
        continue;
      }
      transferWaitWeeks = n;
    }
    let rootingWeeks = 3;
    if (parsed.rootingWeeks) {
      const n = Number(parsed.rootingWeeks);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
        errors.push({ row: parsed.row, label: fullCode, message: "Thời gian ra rễ phải là số nguyên dương" });
        continue;
      }
      rootingWeeks = n;
    }

    claimedFullCodes.add(fullCode);
    validRows.push({
      row: parsed.row,
      label: fullCode,
      categoryCode: parsed.categoryCode,
      categoryName: parsed.categoryName,
      code: fullCode,
      name: parsed.name,
      description: parsed.description,
      transferWaitWeeks,
      rootingWeeks,
    });
  }

  let successCount = 0;
  if (validRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      const categoryIdByCode = new Map<string, string>();
      for (const [categoryCode, categoryName] of claimedCategoryCreations) {
        const created = await tx.plantCategory.create({ data: { code: categoryCode, name: categoryName } });
        categoryIdByCode.set(categoryCode, created.id);
      }

      for (const vr of validRows) {
        let categoryId = categoryIdByCode.get(vr.categoryCode);
        if (!categoryId) {
          const existingCategory = await tx.plantCategory.findUnique({ where: { code: vr.categoryCode }, select: { id: true } });
          categoryId = existingCategory!.id;
        }
        const maxSeq = await tx.plantType.aggregate({ where: { categoryId }, _max: { seq: true } });
        const seq = (maxSeq._max.seq ?? 0) + 1;

        await tx.plantType.create({
          data: {
            categoryId,
            seq,
            code: vr.code,
            name: vr.name,
            description: vr.description,
            transferWaitWeeks: vr.transferWaitWeeks,
            rootingWeeks: vr.rootingWeeks,
          },
        });
        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
