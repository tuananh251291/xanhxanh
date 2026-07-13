import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { cellText, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

type RowError = { row: number; label: string; message: string };

const ROTATION_KIND_LABEL_TO_ENUM = new Map<string, "MAU_ME" | "RA_RE">([
  ["nhóm tuần mẫu mẹ", "MAU_ME"],
  ["nhóm tuần ra rễ", "RA_RE"],
]);

// Nhập hàng loạt NHÓM GIÀN KỆ (gộp kệ tự do + "khe" trong lịch xoay vòng Nhóm tuần mẫu mẹ/ra rễ) —
// làm TRƯỚC Module "Giàn kệ mới" nếu khu sản xuất mới đã có sẵn cách chia nhóm tuần riêng ngoài đời,
// vì kệ cần gán vào đúng nhóm ngay lúc tạo. Khác trang /settings/shelf-groups (tạo tay từng nhóm),
// route này KHÔNG cho trùng Tên nhóm (kể cả trong cùng file) — chặt hơn form tay 1 chút để tránh gõ
// nhầm tên hàng loạt rồi bị vướng lúc chọn Nhóm tuần ở Module "Giàn kệ mới"/"Lô tồn kho hiện có" sau đó
// (2 route đó coi tên nhóm trùng nhau là lỗi "không xác định được nhóm nào").
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel nhóm giàn kệ" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Nhóm giàn kệ");
  sheet.columns = [
    { header: "Tên nhóm", key: "name", width: 22 },
    { header: "Loại (tự do, không bắt buộc)", key: "type", width: 22 },
    { header: "Loại xoay vòng (Nhóm tuần mẫu mẹ/Nhóm tuần ra rễ)", key: "rotationKind", width: 30 },
    { header: "Thứ tự khe (bắt buộc nếu có Loại xoay vòng)", key: "rotationOrder", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1]);
  sheet.addRow({ name: "Nhóm tuần 1", type: "", rotationKind: "Nhóm tuần mẫu mẹ", rotationOrder: 1 });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 16 },
    { header: "Giá trị", key: "code", width: 22 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  helpSheet.addRow({ type: "Loại xoay vòng", code: "Nhóm tuần mẫu mẹ" });
  helpSheet.addRow({ type: "Loại xoay vòng", code: "Nhóm tuần ra rễ" });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "Tải lên chỉ THÊM nhóm giàn kệ mới — không xoá/sửa nhóm đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: 'Để trống "Loại xoay vòng" nếu chỉ muốn gộp kệ tự do, không tham gia lịch xoay vòng theo tuần.' });
  helpSheet.addRow({ type: "Ghi chú", code: "Thứ tự khe = vị trí 1-based trong chu kỳ xoay vòng, tổng số khe = số Nhóm cùng Loại xoay vòng đang có." });

  addGuideSheet(workbook, [
    { column: "Tên nhóm", required: true, description: "Tên duy nhất trong toàn hệ thống, kể cả trùng với dòng khác trong file." },
    { column: "Loại (tự do, không bắt buộc)", required: false, description: "Nhãn tự do để phân loại/lọc, không ảnh hưởng nghiệp vụ." },
    { column: "Loại xoay vòng (Nhóm tuần mẫu mẹ/Nhóm tuần ra rễ)", required: false, description: "Để trống nếu chỉ muốn gộp kệ tự do, không tham gia lịch xoay vòng theo tuần." },
    { column: "Thứ tự khe (bắt buộc nếu có Loại xoay vòng)", required: false, description: "Số nguyên dương, vị trí 1-based trong chu kỳ xoay vòng — bắt buộc điền khi đã chọn Loại xoay vòng." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-nhom-gian-ke.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel nhóm giàn kệ" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Nhóm giàn kệ") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = { row: number; name: string; type?: string; rotationKindText?: string; rotationOrder?: string };
  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const name = cellText(row.getCell(1).value);
    if (!name) return;
    parsedRows.push({
      row: rowNumber,
      name,
      type: cellText(row.getCell(2).value) || undefined,
      rotationKindText: cellText(row.getCell(3).value) || undefined,
      rotationOrder: cellText(row.getCell(4).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  type ValidRow = { row: number; name: string; type: string | null; rotationKind: "MAU_ME" | "RA_RE" | null; rotationOrder: number | null };
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const claimedNames = new Set<string>();

  for (const parsed of parsedRows) {
    const nameKey = parsed.name.toLowerCase();
    if (claimedNames.has(nameKey)) {
      errors.push({ row: parsed.row, label: parsed.name, message: "Tên nhóm trùng với 1 dòng khác trong file" });
      continue;
    }
    const existing = await prisma.shelfGroup.findFirst({ where: { name: parsed.name }, select: { id: true } });
    if (existing) {
      errors.push({ row: parsed.row, label: parsed.name, message: "Tên nhóm đã tồn tại trong hệ thống" });
      continue;
    }

    let rotationKind: "MAU_ME" | "RA_RE" | null = null;
    if (parsed.rotationKindText) {
      const resolved = ROTATION_KIND_LABEL_TO_ENUM.get(parsed.rotationKindText.toLowerCase());
      if (!resolved) {
        errors.push({ row: parsed.row, label: parsed.name, message: `Loại xoay vòng "${parsed.rotationKindText}" không hợp lệ` });
        continue;
      }
      rotationKind = resolved;
    }

    let rotationOrder: number | null = null;
    if (rotationKind) {
      const n = Number(parsed.rotationOrder);
      if (!parsed.rotationOrder || !Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        errors.push({ row: parsed.row, label: parsed.name, message: "Cần Thứ tự khe (số nguyên dương) khi có Loại xoay vòng" });
        continue;
      }
      rotationOrder = n;
    }

    claimedNames.add(nameKey);
    validRows.push({ row: parsed.row, name: parsed.name, type: parsed.type ?? null, rotationKind, rotationOrder });
  }

  let successCount = 0;
  if (validRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        await tx.shelfGroup.create({
          data: { name: vr.name, type: vr.type, rotationKind: vr.rotationKind, rotationOrder: vr.rotationOrder },
        });
        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
