import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { cellText, cellNumber, cellDate } from "@/lib/excel-import";
import { generateOperationErrorTicketCode } from "@/lib/codes";

type RowError = { row: number; label: string; message: string };
type ParsedRow = { row: number; occurredAt: Date; description: string; costAmount: number; xanhxanhCost: number };

// Nhập file Excel "Đơn vận hành lỗi" (Ngày xảy ra/Lỗi vận hành/Chi phí phát sinh/Xanh Xanh chịu chi phí)
// — mỗi dòng tạo 1 OperationErrorTicket cho ĐÚNG 1 kho thị trường chọn trước ở bộ lọc trên trang (gửi
// qua field "warehouseId" trong formData, giống extraFormData ở ExcelImportCard), không đọc mã kho từ
// file — cùng quyền tạo với POST /api/operation-errors (NV bán hàng Quản lý bán lẻ đúng kho/Admin).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session.user.role;
  if (role !== "SALE" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const warehouseId = formData.get("warehouseId");
  if (typeof warehouseId !== "string" || !warehouseId) {
    return NextResponse.json({ message: "Thiếu Kho thị trường — chọn đúng 1 kho ở bộ lọc trước khi tải file lên" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });

  if (role === "SALE") {
    const access = await prisma.retailWarehouseAccess.findFirst({ where: { userId: session.user.id, warehouseId } });
    if (!access) return NextResponse.json({ message: "Bạn không được gán Kho thị trường này" }, { status: 403 });
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  const sheet = workbook.getWorksheet("Đơn vận hành lỗi") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "File không có sheet dữ liệu" }, { status: 400 });

  const errors: RowError[] = [];
  const parsedRows: ParsedRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = dòng ví dụ — luôn bỏ qua.
    const occurredAtRaw = row.getCell(1).value;
    const description = cellText(row.getCell(2).value);
    const costAmount = cellNumber(row.getCell(3).value);
    const xanhxanhCostRaw = row.getCell(4).value;
    if (!cellText(occurredAtRaw) && !description && costAmount === undefined) return; // dòng trống — bỏ qua.

    const label = description || `Dòng ${rowNumber}`;

    const occurredAt = cellDate(occurredAtRaw);
    if (occurredAt === undefined) { errors.push({ row: rowNumber, label, message: "Thiếu Ngày xảy ra" }); return; }
    if (occurredAt === null) { errors.push({ row: rowNumber, label, message: "Ngày xảy ra không hợp lệ" }); return; }

    if (!description) { errors.push({ row: rowNumber, label, message: "Thiếu Lỗi vận hành" }); return; }

    if (costAmount === undefined) { errors.push({ row: rowNumber, label, message: "Thiếu Chi phí phát sinh" }); return; }
    if (!Number.isFinite(costAmount) || costAmount < 0 || !Number.isInteger(costAmount)) {
      errors.push({ row: rowNumber, label, message: "Chi phí phát sinh phải là số nguyên không âm" }); return;
    }

    const xanhxanhCostText = cellText(xanhxanhCostRaw);
    const xanhxanhCost = xanhxanhCostText ? Number(xanhxanhCostText) : 0;
    if (!Number.isFinite(xanhxanhCost) || xanhxanhCost < 0 || !Number.isInteger(xanhxanhCost)) {
      errors.push({ row: rowNumber, label, message: "Xanh Xanh chịu chi phí phải là số nguyên không âm" }); return;
    }
    if (xanhxanhCost > costAmount) {
      errors.push({ row: rowNumber, label, message: "Xanh Xanh chịu chi phí không được vượt quá Chi phí phát sinh" }); return;
    }

    parsedRows.push({ row: rowNumber, occurredAt, description, costAmount, xanhxanhCost });
  });

  if (errors.length > 0) return NextResponse.json({ successCount: 0, errors });
  if (parsedRows.length === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    for (const r of parsedRows) {
      const code = await generateOperationErrorTicketCode(tx);
      await tx.operationErrorTicket.create({
        data: {
          code,
          warehouseId,
          occurredAt: r.occurredAt,
          description: r.description,
          costAmount: r.costAmount,
          xanhxanhCost: r.xanhxanhCost,
          partnerCost: r.costAmount - r.xanhxanhCost,
          createdById: session.user.id,
        },
      });
    }
  });

  return NextResponse.json({ successCount: parsedRows.length, errors: [] });
}
