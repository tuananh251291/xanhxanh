import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { generateTransferCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { cellText, cellDate, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";

type RowError = { row: number; label: string; message: string };

// Nhập hàng loạt PHIẾU BÀN GIAO đang treo (PENDING, chưa xác nhận) ngoài đời — nhiều dòng cùng
// "Nhóm phiếu" (cột tự đặt, không phải mã phiếu thật) gộp thành 1 Transfer nhiều lô, mã phiếu thật
// vẫn tự sinh qua generateTransferCode. CÓ bắn alert LOT_READY_TRANSFER (khác Chỉ định cấy nhập hàng
// loạt không bắn alert) — phiếu PENDING là việc thật còn cần người nhận xác nhận.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel phiếu bàn giao" }, { status: 403 });
  }

  const [warehouses, rooms, staff] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.room.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
    prisma.user.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Phiếu bàn giao");
  sheet.columns = [
    { header: "Nhóm phiếu (tự đặt, gộp nhiều dòng)", key: "group", width: 20 },
    { header: "Mã lô", key: "lotCode", width: 18 },
    { header: "Quy cách (nếu mã lô trùng nhiều quy cách)", key: "stageCode", width: 22 },
    { header: "Số lượng", key: "quantity", width: 12 },
    { header: "Mã kho/phòng đích", key: "destCode", width: 18 },
    { header: "Mã NV gửi", key: "fromStaffCode", width: 14 },
    { header: "Mã NV nhận", key: "toStaffCode", width: 14 },
    { header: "Ngày tạo phiếu", key: "date", width: 14 },
    { header: "Ghi chú dòng", key: "itemNotes", width: 20 },
    { header: "Ghi chú phiếu", key: "groupNotes", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 4, 5, 6, 8]);
  sheet.addRow({
    group: "VD1",
    lotCode: "MT001010726",
    stageCode: "M05",
    quantity: 50,
    destCode: warehouses[0]?.code ?? "SX-A",
    fromStaffCode: staff[0]?.code ?? "NVCM010",
    toStaffCode: staff[1]?.code ?? "NVK01",
    date: "01/07/2026",
    itemNotes: "",
    groupNotes: "Ví dụ minh hoạ",
  });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Loại", key: "type", width: 16 },
    { header: "Mã", key: "code", width: 16 },
    { header: "Tên", key: "name", width: 30 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const w of warehouses) helpSheet.addRow({ type: "Mã kho", code: w.code, name: w.name });
  for (const r of rooms) helpSheet.addRow({ type: "Mã phòng", code: r.code, name: r.name });
  for (const s of staff) helpSheet.addRow({ type: "Mã NV", code: s.code, name: s.name });
  helpSheet.addRow({});
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Tải lên chỉ THÊM phiếu bàn giao mới — không xoá/sửa phiếu đã có trong hệ thống." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Nhiều dòng cùng \"Nhóm phiếu\" sẽ gộp thành 1 phiếu bàn giao nhiều lô." });
  helpSheet.addRow({ type: "Ghi chú", code: "", name: "Mã kho/phòng đích, Mã NV gửi, Ngày tạo phiếu, Ghi chú phiếu: chỉ cần điền ở dòng đầu tiên của mỗi nhóm." });

  addGuideSheet(workbook, [
    { column: "Nhóm phiếu (tự đặt, gộp nhiều dòng)", required: true, description: "Chuỗi tự đặt (không phải mã phiếu thật) — nhiều dòng cùng giá trị này gộp thành 1 phiếu bàn giao nhiều lô." },
    { column: "Mã lô", required: true, description: "Mã lô đang ACTIVE, chưa có phiếu bàn giao PENDING khác." },
    { column: "Quy cách (nếu mã lô trùng nhiều quy cách)", required: false, description: "Chỉ cần điền nếu Mã lô trùng giữa nhiều quy cách (M05/T01/T05)." },
    { column: "Số lượng", required: true, description: "Số nguyên dương." },
    { column: "Mã kho/phòng đích", required: true, description: "Chỉ cần điền ở dòng đầu tiên của mỗi Nhóm phiếu — mã kho hoặc mã phòng, xem sheet Danh mục." },
    { column: "Mã NV gửi", required: true, description: "Chỉ cần điền ở dòng đầu tiên của mỗi Nhóm phiếu." },
    { column: "Mã NV nhận", required: false, description: "Chỉ cần điền ở dòng đầu tiên của mỗi Nhóm phiếu — để trống nếu chưa xác định người nhận." },
    { column: "Ngày tạo phiếu", required: true, description: "Chỉ cần điền ở dòng đầu tiên của mỗi Nhóm phiếu — định dạng dd/mm/yyyy." },
    { column: "Ghi chú dòng", required: false, description: "Ghi chú riêng cho từng lô." },
    { column: "Ghi chú phiếu", required: false, description: "Chỉ cần điền ở dòng đầu tiên của mỗi Nhóm phiếu." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-phieu-ban-giao.xlsx"`,
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel phiếu bàn giao" }, { status: 403 });
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

  const sheet = workbook.getWorksheet("Phiếu bàn giao") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    group: string;
    lotCode: string;
    stageCode?: string;
    quantity?: string;
    destCode?: string;
    fromStaffCode?: string;
    toStaffCode?: string;
    dateRaw: ExcelJS.CellValue;
    itemNotes?: string;
    groupNotes?: string;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const group = cellText(row.getCell(1).value);
    const lotCode = cellText(row.getCell(2).value);
    if (!group || !lotCode) return;
    parsedRows.push({
      row: rowNumber,
      group,
      lotCode,
      stageCode: cellText(row.getCell(3).value) || undefined,
      quantity: cellText(row.getCell(4).value) || undefined,
      destCode: cellText(row.getCell(5).value) || undefined,
      fromStaffCode: cellText(row.getCell(6).value) || undefined,
      toStaffCode: cellText(row.getCell(7).value) || undefined,
      dateRaw: row.getCell(8).value,
      itemNotes: cellText(row.getCell(9).value) || undefined,
      groupNotes: cellText(row.getCell(10).value) || undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const groupsInOrder: string[] = [];
  const groupsByKey = new Map<string, ParsedRow[]>();
  for (const row of parsedRows) {
    if (!groupsByKey.has(row.group)) {
      groupsByKey.set(row.group, []);
      groupsInOrder.push(row.group);
    }
    groupsByKey.get(row.group)!.push(row);
  }

  type ValidItem = { lotId: string; quantity: number; notes?: string };
  type ValidGroup = {
    firstRow: number;
    toWarehouseId: string;
    toRoomId?: string;
    fromWarehouseId: string | null;
    fromRoomId: string | null;
    fromUserId: string;
    toUserId?: string;
    transferredAt?: Date;
    notes?: string;
    items: ValidItem[];
    isFromDarkRoom: boolean;
    isFromRootingRoom: boolean;
  };

  const errors: RowError[] = [];
  const validGroups: ValidGroup[] = [];
  const claimedLotIds = new Set<string>();

  for (const groupKey of groupsInOrder) {
    const rows = groupsByKey.get(groupKey)!;
    const first = rows[0];
    let groupValid = true;

    // Đích, NV gửi/nhận, ngày, ghi chú phiếu — lấy từ dòng đầu của nhóm.
    let toWarehouseId: string | undefined;
    let toRoomId: string | undefined;
    if (!first.destCode) {
      errors.push({ row: first.row, label: groupKey, message: "Thiếu Mã kho/phòng đích ở dòng đầu nhóm" });
      groupValid = false;
    } else {
      const wh = await prisma.warehouse.findUnique({ where: { code: first.destCode }, select: { id: true } });
      if (wh) {
        toWarehouseId = wh.id;
      } else {
        const room = await prisma.room.findUnique({ where: { code: first.destCode }, select: { id: true, warehouseId: true } });
        if (room) {
          toWarehouseId = room.warehouseId;
          toRoomId = room.id;
        } else {
          errors.push({ row: first.row, label: groupKey, message: `Không tìm thấy kho/phòng đích "${first.destCode}"` });
          groupValid = false;
        }
      }
    }

    let fromUserId: string | undefined;
    if (!first.fromStaffCode) {
      errors.push({ row: first.row, label: groupKey, message: "Thiếu Mã NV gửi ở dòng đầu nhóm" });
      groupValid = false;
    } else {
      const u = await prisma.user.findUnique({ where: { code: first.fromStaffCode }, select: { id: true } });
      if (!u) {
        errors.push({ row: first.row, label: groupKey, message: `Không tìm thấy mã NV gửi "${first.fromStaffCode}"` });
        groupValid = false;
      } else {
        fromUserId = u.id;
      }
    }

    let toUserId: string | undefined;
    if (first.toStaffCode) {
      const u = await prisma.user.findUnique({ where: { code: first.toStaffCode }, select: { id: true } });
      if (!u) {
        errors.push({ row: first.row, label: groupKey, message: `Không tìm thấy mã NV nhận "${first.toStaffCode}"` });
        groupValid = false;
      } else {
        toUserId = u.id;
      }
    }

    const dateParsed = cellDate(first.dateRaw);
    if (dateParsed === null) {
      errors.push({ row: first.row, label: groupKey, message: "Ngày tạo phiếu không hợp lệ" });
      groupValid = false;
    }

    // Từng dòng lô trong nhóm.
    const items: ValidItem[] = [];
    let fromWarehouseId: string | null = null;
    let fromRoomId: string | null = null;
    let isFromDarkRoom = false;
    let isFromRootingRoom = false;

    for (const row of rows) {
      const candidates = await prisma.lot.findMany({
        where: { code: row.lotCode, status: "ACTIVE", ...(row.stageCode ? { stageCode: row.stageCode } : {}) },
        select: {
          id: true,
          stageCode: true,
          inspectedAt: true,
          roomId: true,
          shelfId: true,
          room: { select: { warehouseId: true, type: true } },
          shelf: { select: { warehouseId: true, roomId: true, room: { select: { type: true } } } },
        },
      });
      if (candidates.length === 0) {
        errors.push({ row: row.row, label: row.lotCode, message: `Không tìm thấy lô ACTIVE "${row.lotCode}"${row.stageCode ? ` (${row.stageCode})` : ""}` });
        groupValid = false;
        continue;
      }
      if (candidates.length > 1) {
        errors.push({ row: row.row, label: row.lotCode, message: `Mã lô "${row.lotCode}" trùng nhiều quy cách — điền thêm cột Quy cách để phân biệt` });
        groupValid = false;
        continue;
      }
      const lot = candidates[0];

      if (claimedLotIds.has(lot.id)) {
        errors.push({ row: row.row, label: row.lotCode, message: "Lô này đã được dùng ở 1 nhóm phiếu khác trong file" });
        groupValid = false;
        continue;
      }
      const alreadyPending = await prisma.transferItem.findFirst({
        where: { lotId: lot.id, transfer: { status: "PENDING" } },
        select: { id: true },
      });
      if (alreadyPending) {
        errors.push({ row: row.row, label: row.lotCode, message: "Lô này đã có phiếu bàn giao PENDING khác trong hệ thống" });
        groupValid = false;
        continue;
      }

      const quantity = Number(row.quantity);
      if (!row.quantity || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
        errors.push({ row: row.row, label: row.lotCode, message: "Số lượng phải là số nguyên dương" });
        groupValid = false;
        continue;
      }

      claimedLotIds.add(lot.id);
      items.push({ lotId: lot.id, quantity, notes: row.itemNotes });

      if (fromWarehouseId === null && fromRoomId === null) {
        fromWarehouseId = lot.room?.warehouseId ?? lot.shelf?.warehouseId ?? null;
        fromRoomId = lot.roomId ?? lot.shelf?.roomId ?? null;
        isFromDarkRoom = lot.room?.type === "PHONG_TOI" || lot.shelf?.room?.type === "PHONG_TOI";
        isFromRootingRoom = lot.shelf?.room?.type === "PHONG_RA_RE";
      }
      if (isFromDarkRoom && !lot.inspectedAt) {
        errors.push({ row: row.row, label: row.lotCode, message: "Lô từ phòng tối cần \"Đã kiểm tra\" nhiễm trước khi bàn giao" });
        groupValid = false;
      }
    }

    if (!groupValid || !toWarehouseId || !fromUserId) continue;

    validGroups.push({
      firstRow: first.row,
      toWarehouseId,
      toRoomId,
      fromWarehouseId: fromWarehouseId ?? toWarehouseId,
      fromRoomId,
      fromUserId,
      toUserId,
      transferredAt: dateParsed ?? undefined,
      notes: first.groupNotes,
      items,
      isFromDarkRoom,
      isFromRootingRoom,
    });
  }

  // ---- Tạo hàng loạt trong 1 transaction — chỉ khi cả file không còn dòng lỗi nào ----
  let successCount = 0;
  const createdForAlerts: { id: string; code: string; isFromDarkRoom: boolean; isFromRootingRoom: boolean; itemCount: number }[] = [];
  if (validGroups.length > 0 && errors.length === 0) {
    await prisma.$transaction(async (tx) => {
      for (const g of validGroups) {
        const code = await generateTransferCode(tx);
        const transfer = await tx.transfer.create({
          data: {
            code,
            fromWarehouseId: g.fromWarehouseId,
            fromRoomId: g.fromRoomId,
            toWarehouseId: g.toWarehouseId,
            toRoomId: g.toRoomId,
            fromUserId: g.fromUserId,
            toUserId: g.toUserId,
            notes: g.notes,
            status: "PENDING",
            transferredAt: g.transferredAt,
            items: { create: g.items },
          },
        });
        createdForAlerts.push({ id: transfer.id, code, isFromDarkRoom: g.isFromDarkRoom, isFromRootingRoom: g.isFromRootingRoom, itemCount: g.items.length });
        successCount += g.items.length;
      }
    });
  }

  for (const t of createdForAlerts) {
    if (t.isFromDarkRoom) {
      await createAlert({
        type: "LOT_READY_TRANSFER",
        title: "Có phiếu bàn giao từ phòng tối chờ nhận",
        message: `Đã nhập phiếu ${t.code} — ${t.itemCount} lô từ phòng tối, chờ xác nhận nhập kho`,
        targetRole: "KHO_MO",
        relatedId: t.id,
        relatedType: "Transfer",
      });
    }
    if (t.isFromRootingRoom) {
      await createAlert({
        type: "LOT_READY_TRANSFER",
        title: "Có phiếu bàn giao thành phẩm chờ nhận",
        message: `Đã nhập phiếu ${t.code} — ${t.itemCount} lô thành phẩm, chờ xác nhận nhập kho`,
        targetRole: "KHO_THANH_PHAM",
        relatedId: t.id,
        relatedType: "Transfer",
      });
    }
  }

  return NextResponse.json({ successCount, errors });
}
