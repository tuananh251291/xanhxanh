import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { addWeeks, startOfDay, endOfDay, format } from "date-fns";
import { cellText, cellDate, cellNumber, styleExampleRow, addGuideSheet, markRequiredHeaders } from "@/lib/excel-import";
import { generateLotCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";

type RowError = { row: number; label: string; message: string };

const SHEET_NAME = "Tồn phòng tối cá nhân";
const STAGES = [
  { stageCode: "M05", stage: "MAU_ME", col: 4 },
  { stageCode: "T01", stage: "THANH_PHAM", col: 5 },
  { stageCode: "T05", stage: "THANH_PHAM", col: 6 },
] as const;

// Nhập TỒN KHO PHÒNG TỐI CÁ NHÂN của NV cấy mô (mục 10 trang Nhập liệu trực tiếp) — lô nằm thẳng trong
// Phòng tối cá nhân (Lot.roomId, không có kệ, không gắn chỉ định cấy), giống hệt nhánh DARK_ROOM của Nhập
// kho thủ công (POST /api/inventory/stock-in): mỗi (NV + mã cây + quy cách + ngày vào phòng tối) = 1 lô,
// hạn chuyển kệ tính như NV tự nhập nhật ký cấy. NV vẫn phải Kiểm tra nhiễm rồi Bàn giao như bình thường.
// CẬP NHẬT THAY THẾ giống mục 5: combo có dòng trong file bị ghi đè số lượng (để trống ô = 0), combo không
// có trong file giữ nguyên. File có bất kỳ dòng lỗi nào = không ghi gì.
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel tồn phòng tối" }, { status: 403 });
  }

  const staff = await prisma.user.findMany({
    where: { role: "CAY_MO", isActive: true, workplaceWarehouseId: { not: null } },
    select: { code: true, name: true, workplaceWarehouse: { select: { code: true, name: true } } },
    orderBy: [{ workplaceWarehouse: { code: "asc" } }, { code: "asc" }],
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [
    { header: "Mã NV cấy mô", key: "staffCode", width: 16 },
    { header: "Mã cây", key: "plantTypeCode", width: 12 },
    { header: "Ngày vào phòng tối", key: "enteredAt", width: 18 },
    { header: "Số lượng M05 (cụm)", key: "m05", width: 18 },
    { header: "Số lượng T01 (cây)", key: "t01", width: 18 },
    { header: "Số lượng T05 (cây)", key: "t05", width: 18 },
    { header: "Mã lô (để trống = tự sinh)", key: "lotCode", width: 24 },
  ];
  sheet.getRow(1).font = { bold: true };
  markRequiredHeaders(sheet, [1, 2, 3]);
  sheet.addRow({ staffCode: "NVCM001", plantTypeCode: "MT001", enteredAt: "25/09/2026", m05: 500, t01: 1200, t05: null, lotCode: "" });
  styleExampleRow(sheet.getRow(2));

  const helpSheet = workbook.addWorksheet("Danh mục");
  helpSheet.columns = [
    { header: "Mã NV cấy mô", key: "code", width: 16 },
    { header: "Tên NV", key: "name", width: 28 },
    { header: "Kho sản xuất làm việc", key: "warehouse", width: 30 },
  ];
  helpSheet.getRow(1).font = { bold: true };
  for (const s of staff) helpSheet.addRow({ code: s.code, name: s.name, warehouse: `${s.workplaceWarehouse!.code} — ${s.workplaceWarehouse!.name}` });

  addGuideSheet(workbook, [
    { column: "Mã NV cấy mô", required: true, description: "Mã NV cấy mô đang hoạt động, đã gán kho sản xuất làm việc (xem sheet Danh mục). Lô vào đúng Phòng tối cá nhân của NV đó tại kho làm việc." },
    { column: "Mã cây", required: true, description: "Mã loại cây đã có trong hệ thống (VD MT001)." },
    { column: "Ngày vào phòng tối", required: true, description: "Định dạng dd/mm/yyyy, không được là ngày tương lai. Dùng tính hạn chuyển kệ và thứ tự bàn giao (lô cũ phải bàn giao trước)." },
    {
      column: "Số lượng M05 / T01 / T05",
      required: false,
      description: "Số nguyên ≥ 0 (M05 tính theo cụm, T01/T05 theo cây). Để trống = 0: lô cùng NV + mã cây + quy cách + ngày đó (nếu có) bị đưa về 0. Combo không có dòng nào trong file thì giữ nguyên.",
    },
    { column: "Mã lô (để trống = tự sinh)", required: false, description: "Chỉ dùng khi tạo lô mới, không được trùng mã lô đã có. Bỏ qua nếu combo đó đã có lô (chỉ cập nhật số lượng)." },
    { column: "Mỗi dòng", required: false, description: "Mỗi cặp Mã NV + Mã cây + Ngày vào phòng tối chỉ được xuất hiện 1 lần trong file." },
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="mau-ton-phong-toi-ca-nhan.xlsx"`,
    },
  });
}

// Ô ngày kiểu Date của Excel luôn là 00:00 UTC — đổi về đúng ngày đó theo giờ máy chủ, khớp với ô gõ tay
// "dd/mm/yyyy" (cellDate đã parse theo giờ máy chủ).
function toLocalDay(raw: ExcelJS.CellValue, parsed: Date): Date {
  if (raw instanceof Date) return new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  return startOfDay(parsed);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel tồn phòng tối" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Thiếu file" }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }
  const sheet = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  const [staffList, plantTypes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CAY_MO" },
      select: { id: true, code: true, name: true, isActive: true, workplaceWarehouseId: true, workplaceWarehouse: { select: { type: true, isActive: true } } },
    }),
    prisma.plantType.findMany({ select: { id: true, code: true, isActive: true, transferWaitWeeks: true, rootingWeeks: true } }),
  ]);
  const staffByCode = new Map(staffList.map((s) => [s.code.toUpperCase(), s]));
  const plantByCode = new Map(plantTypes.map((p) => [p.code.toUpperCase(), p]));
  const today = endOfDay(new Date());

  type ValidRow = {
    row: number;
    staff: (typeof staffList)[number];
    plant: (typeof plantTypes)[number];
    enteredAt: Date;
    quantities: { stageCode: string; stage: "MAU_ME" | "THANH_PHAM"; quantity: number }[];
    lotCode?: string;
  };
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  const firstRowByCombo = new Map<string, number>();
  const firstRowByLotCode = new Map<string, number>();
  let dataRowCount = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const staffCode = cellText(row.getCell(1).value).toUpperCase();
    const plantCode = cellText(row.getCell(2).value).toUpperCase();
    const dateRaw = row.getCell(3).value;
    const qtyTexts = STAGES.map((s) => cellText(row.getCell(s.col).value));
    const lotCode = cellText(row.getCell(7).value).toUpperCase();
    if (!staffCode && !plantCode && !cellText(dateRaw) && qtyTexts.every((t) => !t) && !lotCode) return;
    dataRowCount += 1;
    const label = `${staffCode || "—"} · ${plantCode || "—"}`;
    const err = (message: string) => errors.push({ row: rowNumber, label, message });

    if (!staffCode) return err("Thiếu Mã NV cấy mô");
    if (!plantCode) return err("Thiếu Mã cây");
    const staff = staffByCode.get(staffCode);
    if (!staff) return err(`Không tìm thấy NV cấy mô có mã "${staffCode}"`);
    if (!staff.isActive) return err(`NV ${staffCode} đã ngừng hoạt động`);
    if (!staff.workplaceWarehouseId || staff.workplaceWarehouse?.type !== "SAN_XUAT" || !staff.workplaceWarehouse.isActive) {
      return err(`NV ${staffCode} chưa được gán kho sản xuất làm việc — cập nhật ở trang Người dùng trước`);
    }
    const plant = plantByCode.get(plantCode);
    if (!plant) return err(`Không tìm thấy mã cây "${plantCode}"`);
    if (!plant.isActive) return err(`Mã cây ${plantCode} đã ngừng hoạt động`);

    const parsedDate = cellDate(dateRaw);
    if (parsedDate === undefined) return err("Thiếu Ngày vào phòng tối");
    if (parsedDate === null) return err(`Ngày vào phòng tối "${cellText(dateRaw)}" không hợp lệ — dùng định dạng dd/mm/yyyy`);
    // new Date() tự "tràn" ngày không tồn tại (31/02 → 03/03) — chặn để không nhập nhầm ngày.
    const dmy = cellText(dateRaw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!(dateRaw instanceof Date) && dmy && (parsedDate.getDate() !== Number(dmy[1]) || parsedDate.getMonth() + 1 !== Number(dmy[2]))) {
      return err(`Ngày vào phòng tối "${cellText(dateRaw)}" không tồn tại`);
    }
    const enteredAt = toLocalDay(dateRaw, parsedDate);
    if (enteredAt > today) return err(`Ngày vào phòng tối ${format(enteredAt, "dd/MM/yyyy")} là ngày tương lai`);

    const quantities: ValidRow["quantities"] = [];
    for (let i = 0; i < STAGES.length; i++) {
      const n = cellNumber(row.getCell(STAGES[i].col).value) ?? 0;
      if (!Number.isInteger(n) || n < 0) return err(`Số lượng ${STAGES[i].stageCode} "${qtyTexts[i]}" không hợp lệ — phải là số nguyên ≥ 0`);
      quantities.push({ stageCode: STAGES[i].stageCode, stage: STAGES[i].stage, quantity: n });
    }

    const combo = `${staffCode}|${plantCode}|${format(enteredAt, "yyyy-MM-dd")}`;
    const firstRow = firstRowByCombo.get(combo);
    if (firstRow !== undefined) return err(`Trùng Mã NV + Mã cây + Ngày vào phòng tối với dòng ${firstRow}`);
    firstRowByCombo.set(combo, rowNumber);

    if (lotCode) {
      const firstLotRow = firstRowByLotCode.get(lotCode);
      if (firstLotRow !== undefined) return err(`Mã lô "${lotCode}" trùng với dòng ${firstLotRow}`);
      firstRowByLotCode.set(lotCode, rowNumber);
    }

    validRows.push({ row: rowNumber, staff, plant, enteredAt, quantities, lotCode: lotCode || undefined });
  });

  if (dataRowCount === 0) return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });

  // Kiểm tra với dữ liệu đang có (sau khi đã sạch lỗi định dạng): lô đang chờ bàn giao thì không được ghi
  // đè (NV đã chốt số lên phiếu), mã lô tự khai không được trùng lô đã có.
  // existingDeletable: lô chưa từng có lịch sử nào (không chỉ định, chưa kiểm tra nhiễm/bàn giao/...) — nếu
  // file đưa về 0 thì XOÁ hẳn thay vì giữ lô 0 (lô 0 vẫn bị màn Kiểm tra nhiễm/Bàn giao của NV nhóm chung
  // theo mã + ngày, hiện 1 dòng "0" khó hiểu). Lô đã có lịch sử thì giữ, chỉ đưa về 0 như quy ước mục 5.
  type Plan = { row: ValidRow; stageCode: string; stage: "MAU_ME" | "THANH_PHAM"; quantity: number; existingId?: string; existingQuantity?: number; existingDeletable?: boolean };
  const plans: Plan[] = [];
  const roomIdByStaff = new Map<string, string | null>();
  if (errors.length === 0) {
    for (const vr of validRows) {
      const label = `${vr.staff.code} · ${vr.plant.code}`;
      if (!roomIdByStaff.has(vr.staff.id)) {
        const room = await prisma.room.findFirst({
          where: { warehouseId: vr.staff.workplaceWarehouseId!, type: "PHONG_TOI", assignedStaffId: vr.staff.id },
          select: { id: true },
        });
        roomIdByStaff.set(vr.staff.id, room?.id ?? null);
      }
      const roomId = roomIdByStaff.get(vr.staff.id);
      let rowHasError = false;
      for (const q of vr.quantities) {
        const existing = roomId
          ? await prisma.lot.findFirst({
              where: {
                roomId,
                plantTypeId: vr.plant.id,
                stageCode: q.stageCode,
                status: "ACTIVE",
                enteredAt: { gte: startOfDay(vr.enteredAt), lte: endOfDay(vr.enteredAt) },
              },
              orderBy: { enteredAt: "asc" },
              select: {
                id: true, code: true, quantity: true, instructionId: true, inspectedAt: true,
                transferItems: { where: { transfer: { status: "PENDING" } }, select: { id: true } },
                _count: {
                  select: {
                    transferItems: true, dailyRecordItems: true, contaminations: true, inspectionItems: true, motherPhotos: true, orderItems: true,
                    orderProcessingRequestsAsSource: true, processingInputRows: true, processingOutputTickets: true, repackAsSource: true,
                    repackAsOutput: true, instructionItems: true, childLots: true,
                  },
                },
              },
            })
          : null;
        if (existing && existing.transferItems.length > 0 && existing.quantity !== q.quantity) {
          errors.push({ row: vr.row, label, message: `Lô ${existing.code} (${q.stageCode}) đang nằm trong phiếu bàn giao chờ xác nhận — không thể sửa số lượng` });
          rowHasError = true;
          continue;
        }
        if (existing) {
          const existingDeletable = !existing.instructionId && !existing.inspectedAt && Object.values(existing._count).every((n) => n === 0);
          plans.push({ row: vr, ...q, existingId: existing.id, existingQuantity: existing.quantity, existingDeletable });
        }
        else if (q.quantity > 0) plans.push({ row: vr, ...q });
      }
      if (rowHasError) continue;
      // Mã lô duy nhất theo (code, stageCode) — chỉ cần xét các quy cách sắp TẠO MỚI ở dòng này.
      const newStageCodes = plans.filter((p) => p.row === vr && !p.existingId).map((p) => p.stageCode);
      if (vr.lotCode && newStageCodes.length > 0) {
        const clash = await prisma.lot.findFirst({ where: { code: vr.lotCode, stageCode: { in: newStageCodes } }, select: { stageCode: true } });
        if (clash) errors.push({ row: vr.row, label, message: `Mã lô "${vr.lotCode}" (${clash.stageCode}) đã tồn tại trong hệ thống` });
      }
    }
  }
  if (errors.length > 0) return NextResponse.json({ successCount: 0, errors });

  // Tạo trước phòng tối cá nhân cho NV chưa có (ngoài transaction, idempotent — giống Nhập kho thủ công).
  for (const vr of validRows) {
    if (!roomIdByStaff.get(vr.staff.id) && plans.some((p) => p.row === vr && !p.existingId)) {
      const room = await getOrCreatePersonalDarkRoom(vr.staff.id, vr.staff.workplaceWarehouseId!);
      roomIdByStaff.set(vr.staff.id, room.id);
    }
  }

  let created = 0, updated = 0, unchanged = 0, removed = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of plans) {
      if (p.existingId) {
        if (p.quantity === 0 && p.existingDeletable) {
          await tx.lot.delete({ where: { id: p.existingId } });
          removed += 1;
          continue;
        }
        if (p.existingQuantity === p.quantity) { unchanged += 1; continue; }
        await tx.lot.update({ where: { id: p.existingId }, data: { quantity: p.quantity } });
        updated += 1;
        continue;
      }
      const { row: vr } = p;
      const code = vr.lotCode ?? (await generateLotCode({ plantTypeCode: vr.plant.code, staffCode: vr.staff.code, stageCode: p.stageCode, date: vr.enteredAt, client: tx }));
      await tx.lot.create({
        data: {
          code,
          plantTypeId: vr.plant.id,
          stage: p.stage,
          stageCode: p.stageCode,
          roomId: roomIdByStaff.get(vr.staff.id)!,
          quantity: p.quantity,
          initialQuantity: p.quantity,
          status: "ACTIVE",
          enteredAt: vr.enteredAt,
          darkRoomEnteredAt: vr.enteredAt,
          expectedMoveAt: addWeeks(vr.enteredAt, p.stage === "MAU_ME" ? vr.plant.transferWaitWeeks : vr.plant.rootingWeeks),
        },
      });
      created += 1;
    }
  }, { timeout: 60000 });

  const summary = created + updated + removed === 0
    ? "File giống hệt số liệu hiện tại — không có gì thay đổi"
    : `Đã nhập: ${created} lô mới, ${updated} lô cập nhật số lượng${removed ? `, ${removed} lô bị xoá (về 0)` : ""}${unchanged ? `, ${unchanged} lô giữ nguyên` : ""}`;
  return NextResponse.json({ successCount: created + updated + removed, errors, summary });
}
