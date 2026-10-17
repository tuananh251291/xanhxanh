import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { isAdminRole } from "@/types";
import { cellText, cellNumber, cellDate } from "@/lib/excel-import";
import { generateMarketExportCode } from "@/lib/codes";
import { parseExportStageCode, roomKindForStageCode, bagSizeForStageCode } from "@/lib/market-export";
import { deductFromRoomFifo, InsufficientRoomStockError } from "@/lib/finished-goods";
import type { UserRole } from "@prisma/client";

function canUseMarketExport(role: UserRole | null | undefined) {
  return role === "DOI_TAC_VAN_HANH" || isAdminRole(role);
}

// Lịch sử các lần tải file "Xuất cây" — chỉ trong đúng Kho thị trường của Đối tác đang đăng nhập (Admin
// xem được của mọi kho vì không gắn workplaceWarehouseId cố định).
export async function GET() {
  const session = await auth();
  if (!canUseMarketExport(session?.user?.role)) {
    return NextResponse.json({ message: "Bạn không có quyền dùng chức năng này" }, { status: 403 });
  }

  const isAdmin = isAdminRole(session!.user.role);
  const warehouseId = session!.user.workplaceWarehouseId;
  if (!isAdmin && !warehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán Kho thị trường phụ trách — liên hệ Admin cấp cao" }, { status: 400 });
  }

  const exports = await prisma.marketExport.findMany({
    where: isAdmin ? undefined : { warehouseId: warehouseId! },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      createdBy: { select: { name: true, code: true } },
      items: { select: { quantity: true, deductedQuantity: true } },
    },
  });

  return NextResponse.json(
    exports.map((e) => ({
      id: e.id,
      code: e.code,
      fileName: e.fileName,
      createdAt: e.createdAt,
      createdBy: e.createdBy,
      itemCount: e.items.length,
      totalQuantity: e.items.reduce((s, i) => s + i.quantity, 0),
      totalDeducted: e.items.reduce((s, i) => s + i.deductedQuantity, 0),
    }))
  );
}

type RowError = { row: number; label: string; message: string };
type ParsedRow = {
  row: number;
  orderCode: string;
  status: string;
  orderedAt: Date;
  quantity: number;
  spfName: string;
  productCode: string;
  internalName: string;
  plantTypeId: string;
  plantTypeCode: string;
  stageCode: string;
  roomKind: "PHONG_SAN_PHAM_DAT" | "PHONG_CAY_TRONG";
};

// Nhập file Excel "Xuất cây" (Mã đơn/Tình trạng/Ngày/Lineitem quantity/Tên SPF/Mã hàng/Tên nội bộ) do
// Đối tác vận hành tải trực tiếp từ sàn bán hàng — mỗi dòng trừ THẲNG vào tồn thực (Lot.quantity) ở đúng
// Phòng sản phẩm đạt (quy cách túi) hoặc Phòng cây trồng (quy cách chậu) của Kho thị trường đang phụ
// trách. KHÔNG cho xuất vượt tồn (từ 17/10/2026 — trước đây cho âm): cộng dồn số cây cần trừ của CẢ file
// theo (phòng, mã cây, quy cách), thiếu ở đâu thì báo lỗi từng dòng và không nhập dòng nào (giống lỗi dữ
// liệu khác); trừ FIFO qua nhiều lô (deductFromRoomFifo), kiểm tra lại trong transaction. KHÔNG lọc theo Tình trạng — mọi dòng hợp lệ trong file đều
// tính là đã xuất. Dòng trùng (Mã đơn + Mã hàng) với lần tải trước đó bị BỎ QUA (không trừ lại lần 2) để
// tải lại file có phần trùng lặp (VD sàn xuất lại đơn cũ) không làm sai tồn kho — báo qua duplicateCount,
// KHÔNG chặn cả file như lỗi dữ liệu thật (xem RowError bên dưới).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!canUseMarketExport(session?.user?.role)) {
    return NextResponse.json({ message: "Bạn không có quyền dùng chức năng này" }, { status: 403 });
  }
  const warehouseId = session!.user.workplaceWarehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Bạn chưa được gán Kho thị trường phụ trách — liên hệ Admin cấp cao" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  const sheet = workbook.getWorksheet("Xuất cây") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "File không có sheet dữ liệu" }, { status: 400 });

  const [passedRoom, plantedRoom, plantTypes] = await Promise.all([
    prisma.room.findFirst({ where: { warehouseId, type: "PHONG_SAN_PHAM_DAT", isActive: true }, select: { id: true } }),
    prisma.room.findFirst({ where: { warehouseId, type: "PHONG_CAY_TRONG", isActive: true }, select: { id: true } }),
    prisma.plantType.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true } }),
  ]);
  if (!passedRoom || !plantedRoom) {
    return NextResponse.json({ message: "Kho thị trường thiếu Phòng sản phẩm đạt/Phòng cây trồng — liên hệ Admin kiểm tra lại kho" }, { status: 400 });
  }
  const roomIdByKind = { PHONG_SAN_PHAM_DAT: passedRoom.id, PHONG_CAY_TRONG: plantedRoom.id } as const;
  const plantTypeByName = new Map(plantTypes.map((p) => [p.name.trim().toLowerCase(), p]));

  const errors: RowError[] = [];
  const parsedRows: ParsedRow[] = [];
  const seenInFile = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = dòng ví dụ — luôn bỏ qua.
    const orderCode = cellText(row.getCell(1).value);
    const status = cellText(row.getCell(2).value);
    const orderedAtRaw = row.getCell(3).value;
    const quantity = cellNumber(row.getCell(4).value);
    const spfName = cellText(row.getCell(5).value);
    const productCode = cellText(row.getCell(6).value);
    const internalName = cellText(row.getCell(7).value);
    if (!orderCode && !productCode && !internalName && quantity === undefined) return; // dòng trống — bỏ qua.

    const label = `${orderCode || "?"} · ${productCode || "?"}`;
    if (!orderCode) { errors.push({ row: rowNumber, label, message: "Thiếu Mã đơn" }); return; }

    const orderedAt = cellDate(orderedAtRaw);
    if (orderedAt === undefined) { errors.push({ row: rowNumber, label, message: "Thiếu Ngày" }); return; }
    if (orderedAt === null) { errors.push({ row: rowNumber, label, message: "Ngày không hợp lệ" }); return; }

    if (quantity === undefined) { errors.push({ row: rowNumber, label, message: "Thiếu Lineitem quantity" }); return; }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
      errors.push({ row: rowNumber, label, message: "Lineitem quantity phải là số nguyên dương" }); return;
    }

    if (!productCode) { errors.push({ row: rowNumber, label, message: "Thiếu Mã hàng" }); return; }
    const stageCode = parseExportStageCode(productCode);
    if (!stageCode) {
      errors.push({ row: rowNumber, label, message: `Không xác định được quy cách từ Mã hàng "${productCode}" (cần chứa T01/T05/T10 hoặc S/M/L/C)` });
      return;
    }
    const roomKind = roomKindForStageCode(stageCode);
    if (!roomKind) { errors.push({ row: rowNumber, label, message: `Quy cách "${stageCode}" không xác định được phòng đích` }); return; }

    if (!internalName) { errors.push({ row: rowNumber, label, message: "Thiếu Tên nội bộ" }); return; }
    const plantType = plantTypeByName.get(internalName.trim().toLowerCase());
    if (!plantType) { errors.push({ row: rowNumber, label, message: `Không tìm thấy Loại cây có Tên nội bộ "${internalName}"` }); return; }

    const dedupeKey = `${orderCode.trim().toUpperCase()}::${productCode.trim().toUpperCase()}`;
    if (seenInFile.has(dedupeKey)) {
      errors.push({ row: rowNumber, label, message: `Trùng Mã đơn + Mã hàng với 1 dòng khác trong CÙNG file này` });
      return;
    }
    seenInFile.add(dedupeKey);

    parsedRows.push({
      row: rowNumber,
      orderCode,
      status,
      orderedAt,
      quantity,
      spfName,
      productCode,
      internalName,
      plantTypeId: plantType.id,
      plantTypeCode: plantType.code,
      stageCode,
      roomKind,
    });
  });

  if (errors.length > 0) return NextResponse.json({ successCount: 0, errors });
  if (parsedRows.length === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });

  // Bỏ qua (không trừ lại) dòng đã nhập ở 1 lần tải file trước đó — khớp theo (Mã đơn, Mã hàng), không
  // phải lỗi dữ liệu nên không chặn các dòng còn lại của file.
  const orderCodes = Array.from(new Set(parsedRows.map((r) => r.orderCode.trim())));
  // Chỉ so trùng trong ĐÚNG kho này — 2 Kho thị trường khác nhau có thể trùng Mã đơn của sàn.
  const existingItems = await prisma.marketExportItem.findMany({
    where: { orderCode: { in: orderCodes }, export: { warehouseId } },
    select: { orderCode: true, productCode: true },
  });
  const existingKeys = new Set(existingItems.map((i) => `${i.orderCode.trim().toUpperCase()}::${i.productCode.trim().toUpperCase()}`));
  const newRows = parsedRows.filter((r) => !existingKeys.has(`${r.orderCode.trim().toUpperCase()}::${r.productCode.trim().toUpperCase()}`));
  const duplicateCount = parsedRows.length - newRows.length;

  if (newRows.length === 0) {
    return NextResponse.json({ successCount: 0, duplicateCount, errors: [] });
  }

  // Kiểm tra tồn trước khi ghi: cộng dồn số cây cần trừ của cả file theo (phòng, mã cây, quy cách).
  type Need = { roomId: string; plantTypeId: string; plantTypeCode: string; stageCode: string; quantity: number; rows: ParsedRow[] };
  const needs = new Map<string, Need>();
  for (const r of newRows) {
    const roomId = roomIdByKind[r.roomKind];
    const key = `${roomId}:${r.plantTypeId}:${r.stageCode}`;
    const n = needs.get(key) ?? { roomId, plantTypeId: r.plantTypeId, plantTypeCode: r.plantTypeCode, stageCode: r.stageCode, quantity: 0, rows: [] };
    n.quantity += r.quantity * bagSizeForStageCode(r.stageCode);
    n.rows.push(r);
    needs.set(key, n);
  }
  const stockLots = await prisma.lot.findMany({
    where: { roomId: { in: [passedRoom.id, plantedRoom.id] }, status: "ACTIVE", quantity: { gt: 0 }, plantTypeId: { in: [...new Set(newRows.map((r) => r.plantTypeId))] } },
    select: { roomId: true, plantTypeId: true, stageCode: true, quantity: true },
  });
  const available = new Map<string, number>();
  for (const l of stockLots) {
    const key = `${l.roomId}:${l.plantTypeId}:${l.stageCode}`;
    available.set(key, (available.get(key) ?? 0) + l.quantity);
  }
  const stockErrors: RowError[] = [];
  for (const [key, n] of needs) {
    const have = available.get(key) ?? 0;
    if (have >= n.quantity) continue;
    for (const r of n.rows) {
      stockErrors.push({
        row: r.row,
        label: `${r.orderCode} · ${r.productCode}`,
        message: `Vượt tồn: ${n.plantTypeCode} ${n.stageCode} cả file cần ${n.quantity.toLocaleString("vi-VN")} cây, ${n.roomId === passedRoom.id ? "Phòng sản phẩm đạt" : "Phòng cây trồng"} chỉ còn ${have.toLocaleString("vi-VN")} cây`,
      });
    }
  }
  if (stockErrors.length > 0) {
    return NextResponse.json({ successCount: 0, errors: stockErrors.sort((a, b) => a.row - b.row) });
  }

  try {
  await prisma.$transaction(async (tx) => {
    const code = await generateMarketExportCode(tx);
    const marketExport = await tx.marketExport.create({
      data: { code, warehouseId, fileName: file.name, createdById: session!.user.id },
    });

    for (const r of newRows) {
      const deductedQuantity = r.quantity * bagSizeForStageCode(r.stageCode);
      const roomId = roomIdByKind[r.roomKind];
      await deductFromRoomFifo(tx, roomId, r.plantTypeId, r.stageCode, deductedQuantity, `Dòng ${r.row} (${r.plantTypeCode} ${r.stageCode})`);
      await tx.marketExportItem.create({
        data: {
          exportId: marketExport.id,
          orderCode: r.orderCode,
          status: r.status || null,
          orderedAt: r.orderedAt,
          quantity: r.quantity,
          spfName: r.spfName || null,
          productCode: r.productCode,
          internalName: r.internalName,
          plantTypeId: r.plantTypeId,
          stageCode: r.stageCode,
          roomId,
          deductedQuantity,
        },
      });
    }
  });
  } catch (err) {
    // Tồn vừa bị thao tác khác trừ mất giữa lúc kiểm tra và lúc ghi — báo lại, không ghi gì.
    if (err instanceof InsufficientRoomStockError) return NextResponse.json({ message: `${err.message} — tải lại file sau khi kiểm tra tồn` }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ successCount: newRows.length, duplicateCount, errors: [] });
}
