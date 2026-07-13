import ExcelJS from "exceljs";

// Đọc giá trị text của 1 ô Excel — ExcelJS trả các dạng khác nhau tuỳ loại ô (chuỗi thường, rich
// text {text}, formula {result}...). Dùng chung cho mọi route nhập Excel hàng loạt (xem
// src/app/api/shelves/import/route.ts và các route dưới src/app/api/data-import/*).
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const obj = value as { text?: unknown; result?: unknown };
    if ("text" in obj) return String(obj.text ?? "").trim();
    if ("result" in obj) return String(obj.result ?? "").trim();
    return "";
  }
  return String(value).trim();
}

// Đọc giá trị số của 1 ô — trả undefined nếu ô rỗng, NaN nếu có nội dung nhưng không parse được số
// (để nơi gọi tự quyết định thông báo lỗi phù hợp thay vì âm thầm coi như rỗng).
export function cellNumber(value: ExcelJS.CellValue): number | undefined {
  const text = cellText(value);
  if (!text) return undefined;
  return Number(text);
}

// Tô nhạt + in nghiêng dòng ví dụ (luôn ở dòng 2, ngay sau header) để phân biệt trực quan với dữ liệu
// thật — dòng này CHỈ minh hoạ định dạng, mọi route POST đều bỏ qua khi nhập lại (skip rowNumber <= 2,
// không chỉ rowNumber === 1 như trước).
export function styleExampleRow(row: ExcelJS.Row): void {
  row.font = { italic: true, color: { argb: "FF999999" } };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
  });
}

// Đánh dấu hoa thị (*) + tô đỏ tiêu đề các cột BẮT BUỘC phải điền — thiếu sẽ báo lỗi khi tải file lên.
// Gọi ngay sau khi set sheet.columns (header đã có ở dòng 1), truyền đúng vị trí cột (1-based, khớp
// thứ tự khai báo trong sheet.columns).
export function markRequiredHeaders(sheet: ExcelJS.Worksheet, requiredColumnIndices: number[]): void {
  for (const idx of requiredColumnIndices) {
    const cell = sheet.getRow(1).getCell(idx);
    cell.value = `${cell.value} *`;
    cell.font = { bold: true, color: { argb: "FFFF0000" } };
  }
}

// Thêm 1 sheet "Hướng dẫn" định nghĩa ý nghĩa/định dạng/bắt buộc hay không của từng cột trong sheet dữ
// liệu chính — luôn thêm SAU CÙNG (sau sheet "Danh mục" nếu có) để sheet dữ liệu chính vẫn là tab hiện
// ra đầu tiên khi mở file (ExcelJS/Excel mặc định active tab = sheet được thêm đầu tiên).
export function addGuideSheet(
  workbook: ExcelJS.Workbook,
  columns: { column: string; required: boolean; description: string }[]
): void {
  const guideSheet = workbook.addWorksheet("Hướng dẫn");
  guideSheet.columns = [
    { header: "Cột", key: "column", width: 40 },
    { header: "Bắt buộc?", key: "required", width: 12 },
    { header: "Mô tả / Định dạng", key: "description", width: 80 },
  ];
  guideSheet.getRow(1).font = { bold: true };
  for (const c of columns) {
    guideSheet.addRow({ column: c.column, required: c.required ? "Có" : "Không", description: c.description });
  }
  guideSheet.addRow({});
  guideSheet.addRow({
    column: "Lưu ý",
    required: "",
    description:
      "Dòng 2 của sheet dữ liệu chính là dòng VÍ DỤ minh hoạ định dạng (in nghiêng, nền xám) — hệ thống tự bỏ qua dòng này khi nhập lại, không cần xoá trước khi tải lên.",
  });
  guideSheet.addRow({
    column: "Lưu ý",
    required: "",
    description:
      "Cột có dấu * màu đỏ trên tiêu đề sheet dữ liệu chính là cột BẮT BUỘC — để trống sẽ báo lỗi khi tải file lên.",
  });
}

// Đọc giá trị ngày của 1 ô — ExcelJS trả Date object nếu ô định dạng ngày, hoặc chuỗi "dd/mm/yyyy"
// nếu ô định dạng text thường (Admin gõ tay). Trả undefined nếu ô rỗng, null nếu có nội dung nhưng
// không parse được ngày hợp lệ (để nơi gọi tự báo lỗi rõ ràng theo dòng/cột).
export function cellDate(value: ExcelJS.CellValue): Date | null | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date) return value;
  const text = cellText(value);
  if (!text) return undefined;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, d, m, y] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
