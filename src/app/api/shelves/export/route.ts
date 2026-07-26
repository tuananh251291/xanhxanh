import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

const STAGE_CODE_HINT: Record<"PHONG_MAU_ME" | "PHONG_RA_RE", string> = {
  PHONG_MAU_ME: "M05",
  PHONG_RA_RE: "T01/T05",
};
const ROTATION_KIND: Record<"PHONG_MAU_ME" | "PHONG_RA_RE", "MAU_ME" | "RA_RE"> = {
  PHONG_MAU_ME: "MAU_ME",
  PHONG_RA_RE: "RA_RE",
};

// Xuất Excel danh sách giàn kệ của 1 phòng (Phòng mẫu mẹ hoặc Phòng ra rễ — 2 loại phòng duy nhất có
// giàn kệ) để SUPER_ADMIN điền mã cây/mã NV/nhóm tuần/số lượng hàng loạt ngoài Excel rồi nhập lại —
// xem POST /api/shelves/import. Mã cây/mã NV chỉ thật sự lưu vào giàn kệ khi ở Phòng mẫu mẹ — ở Phòng
// ra rễ 2 cột này chỉ dùng để sinh lô mới (Shelf không có plantTypeId/assignedStaffId cho phòng đó).
export async function GET(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được xuất Excel giàn kệ" }, { status: 403 });
  }

  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ message: "Thiếu roomId" }, { status: 400 });

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!room || (room.type !== "PHONG_MAU_ME" && room.type !== "PHONG_RA_RE")) {
    return NextResponse.json({ message: "Không tìm thấy phòng có giàn kệ" }, { status: 404 });
  }
  const roomType = room.type as "PHONG_MAU_ME" | "PHONG_RA_RE";

  const [shelves, plantTypes, staff, rotationGroups] = await Promise.all([
    prisma.shelf.findMany({
      where: { roomId, isActive: true },
      select: {
        code: true,
        name: true,
        plantType: { select: { code: true, name: true } },
        assignedStaff: { select: { code: true, name: true } },
        rotationGroup: { select: { name: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true, stageCode: true } },
      },
      orderBy: [{ rowNumber: "asc" }, { colNumber: "asc" }],
    }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({
      where: { role: "CAY_MO", isActive: true },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    }),
    prisma.shelfGroup.findMany({
      where: { rotationKind: ROTATION_KIND[roomType] },
      select: { name: true },
      orderBy: { rotationOrder: "asc" },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();

  // 1 kệ có thể có NHIỀU lô ACTIVE cùng lúc (VD Phòng ra rễ có cả T01 lẫn T05) ở CẢ 2 loại phòng — cột
  // "Số lượng" luôn mang nghĩa "số lượng lô MỚI cần ghi nhận thêm" (POST /api/shelves/import
  // luôn tạo lô mới, không có khái niệm "sửa lô hiện tại"), nên KHÔNG điền sẵn (để trống khi xuất), tổng
  // số hiện có chỉ hiện ở cột tham khảo riêng cho khỏi nhầm là "sửa số cũ".
  const sheet = workbook.addWorksheet("Giàn kệ");
  sheet.columns = [
    { header: "Mã kệ", key: "code", width: 22 },
    { header: "Tên kệ", key: "name", width: 16 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Mã NV phụ trách", key: "staffCode", width: 16 },
    { header: "Nhóm tuần", key: "rotationGroup", width: 18 },
    { header: `Quy cách (${STAGE_CODE_HINT[roomType]})`, key: "stageCode", width: 16 },
    { header: "Số lượng cây MỚI cần thêm", key: "quantity", width: 22 },
    { header: "Tổng số lượng hiện có (tham khảo, không đọc lại)", key: "currentTotal", width: 28 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1]);
  sheet.addRow({
    code: `${room.code}-A01C01`,
    name: "Kệ A01C01",
    plantTypeCode: plantTypes[0]?.code ?? "MT001",
    staffCode: staff[0]?.code ?? "NVCM010",
    rotationGroup: rotationGroups[0]?.name ?? "",
    stageCode: STAGE_CODE_HINT[roomType].split("/")[0],
    quantity: 100,
    currentTotal: "",
  });
  styleExampleRow(sheet.getRow(2));

  for (const shelf of shelves) {
    const totalQuantity = shelf.lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const stageCodes = Array.from(new Set(shelf.lots.map((l) => l.stageCode)));
    sheet.addRow({
      code: shelf.code,
      name: shelf.name,
      plantTypeCode: shelf.plantType?.code ?? "",
      staffCode: shelf.assignedStaff?.code ?? "",
      rotationGroup: shelf.rotationGroup?.name ?? "",
      stageCode: stageCodes.join("/"),
      quantity: "",
      currentTotal: totalQuantity || "",
    });
  }

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 14 },
    { header: "Mã", key: "code", width: 14 },
    { header: "Tên", key: "name", width: 30 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const p of plantTypes) helpSheet.addRow({ type: "Mã cây", code: p.code, name: p.name });
  for (const s of staff) helpSheet.addRow({ type: "Mã NV", code: s.code, name: s.name });
  for (const g of rotationGroups) helpSheet.addRow({ type: "Nhóm tuần", code: g.name, name: "" });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Để trống 1 ô = giữ nguyên giá trị hiện có. Gõ \"-\" = xoá gán." });
  helpSheet.addRow({
    type: "Ghi chú",
    code: "",
    name: "1 kệ có thể chứa nhiều lô/quy cách cùng lúc (VD Phòng ra rễ có cả T01 lẫn T05) — cột Số lượng là số lượng lô MỚI cần thêm, không phải sửa số cũ. Giới hạn duy nhất là sức chứa (capacity) của kệ.",
  });

  addGuideSheet(workbook, [
    { column: "Mã kệ", required: true, description: "Mã kệ đã tồn tại trong hệ thống — không đổi được qua file này (mã kệ mới dùng mục \"Giàn kệ mới\" ở Nhập liệu trực tiếp)." },
    { column: "Tên kệ", required: false, description: "Chỉ để tham khảo, không đọc lại khi nhập." },
    { column: "Mã cây", required: false, description: 'Để trống = giữ nguyên giá trị hiện có. Gõ "-" = xoá gán. Chỉ lưu vào kệ khi ở Phòng mẫu mẹ.' },
    { column: "Mã NV phụ trách", required: false, description: 'Để trống = giữ nguyên giá trị hiện có. Gõ "-" = xoá gán. Chỉ lưu vào kệ khi ở Phòng mẫu mẹ.' },
    { column: "Nhóm tuần", required: false, description: 'Để trống = giữ nguyên giá trị hiện có. Gõ "-" = xoá gán. Tên Nhóm giàn kệ xoay vòng, xem sheet Danh mục.' },
    { column: `Quy cách (${STAGE_CODE_HINT[roomType]})`, required: false, description: "Bắt buộc nếu có điền Số lượng — quy cách của lô mới sẽ tạo." },
    { column: "Số lượng cây MỚI cần thêm", required: false, description: "Luôn tạo LÔ MỚI khi điền (không sửa lô cũ) — tổng tồn trên kệ không được vượt sức chứa (capacity)." },
    { column: "Tổng số lượng hiện có (tham khảo, không đọc lại)", required: false, description: "Chỉ để xem, hệ thống không đọc cột này khi nhập lại." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="giangke-${room.code}.xlsx"`,
    },
  });
}
