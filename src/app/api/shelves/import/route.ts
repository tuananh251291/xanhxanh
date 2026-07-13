import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ExcelJS from "exceljs";
import { addWeeks } from "date-fns";
import { lotCodeBase } from "@/lib/codes";
import { resolveShelfAttributeUpdate, type ShelfAttributeUpdateData } from "@/lib/shelf-attribute-update";
import { cellText } from "@/lib/excel-import";
import { sumLotQuantity } from "@/types";

const MAX_CODE_ATTEMPTS = 50;
const STAGE_CODES_BY_ROOM: Record<"PHONG_MAU_ME" | "PHONG_RA_RE", Set<string>> = {
  PHONG_MAU_ME: new Set(["M03", "M05"]),
  PHONG_RA_RE: new Set(["T01", "T05"]),
};
const ROTATION_KIND_BY_ROOM: Record<"PHONG_MAU_ME" | "PHONG_RA_RE", "MAU_ME" | "RA_RE"> = {
  PHONG_MAU_ME: "MAU_ME",
  PHONG_RA_RE: "RA_RE",
};
const LOT_STAGE_BY_ROOM: Record<"PHONG_MAU_ME" | "PHONG_RA_RE", "MAU_ME" | "THANH_PHAM"> = {
  PHONG_MAU_ME: "MAU_ME",
  PHONG_RA_RE: "THANH_PHAM",
};

type RowError = { row: number; shelfCode: string; message: string };

type LotPlan = { stageCode: string };

type ResolvedPlantType = { id: string; code: string; transferWaitWeeks: number; rootingWeeks: number };

type ValidRow = {
  row: number;
  shelfId: string;
  shelfUpdateData: ShelfAttributeUpdateData & { rotationGroupId?: string | null };
  quantity?: number;
  lotPlan?: LotPlan;
  plantType?: ResolvedPlantType | null;
  staffCode?: string | null;
};

// Nhập Excel hàng loạt cho giàn kệ 1 phòng (Phòng mẫu mẹ hoặc Phòng ra rễ) — gán mã cây/mã NV/nhóm
// tuần + tạo lô theo số lượng điền trong file. Phòng mẫu mẹ: mã cây/mã NV lưu thẳng vào Shelf; Phòng ra
// rễ: 2 cột này chỉ dùng để sinh lô mới (Shelf không có 2 field đó ở phòng đó). Cả 2 loại phòng đều
// dùng chung 1 quy tắc: 1 kệ có thể chứa nhiều lô ACTIVE cùng lúc (nhiều quy cách khác nhau, VD cả
// M03 lẫn M05), luôn TẠO MỚI 1 lô khi có số lượng — không có khái niệm "sửa lô hiện tại" — giới hạn
// duy nhất là sức chứa còn lại của kệ (capacity, đơn vị túi).
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ message: "Chỉ Admin cấp cao mới được nhập Excel giàn kệ" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  const roomId = formData.get("roomId");
  if (!(file instanceof File) || typeof roomId !== "string" || !roomId) {
    return NextResponse.json({ message: "Thiếu file hoặc roomId" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, type: true } });
  if (!room || (room.type !== "PHONG_MAU_ME" && room.type !== "PHONG_RA_RE")) {
    return NextResponse.json({ message: "Không tìm thấy phòng có giàn kệ" }, { status: 404 });
  }
  const roomType = room.type as "PHONG_MAU_ME" | "PHONG_RA_RE";
  const isMauMe = roomType === "PHONG_MAU_ME";
  const validStageCodes = STAGE_CODES_BY_ROOM[roomType];
  const rotationKind = ROTATION_KIND_BY_ROOM[roomType];
  const lotStage = LOT_STAGE_BY_ROOM[roomType];

  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs resolves its own nested (older) @types/node Buffer type via fast-csv's dependency,
    // structurally incompatible with this project's newer generic Buffer<T> — same type at runtime,
    // `any` needed here since there's no way to reference exceljs's own Buffer type from this file.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  } catch {
    return NextResponse.json({ message: "File không đúng định dạng Excel (.xlsx)" }, { status: 400 });
  }

  const sheet = workbook.getWorksheet("Giàn kệ") ?? workbook.worksheets[0];
  if (!sheet) return NextResponse.json({ message: "Không tìm thấy sheet dữ liệu" }, { status: 400 });

  type ParsedRow = {
    row: number;
    shelfCode: string;
    plantTypeCode?: string;
    staffCode?: string;
    rotationGroupName?: string;
    stageCode?: string;
    quantity?: number;
  };

  const parsedRows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) return; // dòng 1 = header, dòng 2 = ví dụ minh hoạ (luôn bỏ qua)
    const shelfCode = cellText(row.getCell(1).value);
    if (!shelfCode) return;
    const rawQuantity = cellText(row.getCell(7).value);
    parsedRows.push({
      row: rowNumber,
      shelfCode,
      plantTypeCode: cellText(row.getCell(3).value) || undefined,
      staffCode: cellText(row.getCell(4).value) || undefined,
      rotationGroupName: cellText(row.getCell(5).value) || undefined,
      stageCode: cellText(row.getCell(6).value) || undefined,
      quantity: rawQuantity ? Number(rawQuantity) : undefined,
    });
  });

  if (parsedRows.length === 0) {
    return NextResponse.json({ message: "File không có dòng dữ liệu nào" }, { status: 400 });
  }

  const rotationGroups = await prisma.shelfGroup.findMany({
    where: { rotationKind },
    select: { id: true, name: true, rotationOrder: true },
  });
  const rotationGroupsByName = new Map<string, { id: string; rotationOrder: number | null }[]>();
  for (const g of rotationGroups) {
    const list = rotationGroupsByName.get(g.name) ?? [];
    list.push({ id: g.id, rotationOrder: g.rotationOrder });
    rotationGroupsByName.set(g.name, list);
  }

  // ---- Giai đoạn 1: validate toàn bộ, không ghi DB ----
  const errors: RowError[] = [];
  const validRows: ValidRow[] = [];
  // Cộng dồn số lượng đã "giữ chỗ" cho cùng 1 kệ qua nhiều dòng trong CÙNG 1 file (VD 1 dòng M03 + 1
  // dòng M05 cho cùng 1 mã kệ) — vì shelf được đọc lại từ DB riêng cho từng dòng, không tự thấy được
  // dòng trước đó trong cùng file đã cộng thêm bao nhiêu.
  const claimedShelfUsage = new Map<string, number>();

  for (const parsed of parsedRows) {
    const shelf = await prisma.shelf.findFirst({
      where: { code: parsed.shelfCode, roomId, isActive: true },
      select: {
        id: true,
        plantTypeId: true,
        assignedStaffId: true,
        rotationGroupId: true,
        capacity: true,
        assignedStaff: { select: { code: true } },
        lots: { where: { status: "ACTIVE" }, select: { quantity: true } },
      },
    });
    if (!shelf) {
      errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: "Không tìm thấy kệ này trong phòng đã chọn" });
      continue;
    }

    // Mã cây — chỉ coi là "thay đổi thật" (đưa vào validate/áp dụng) nếu khác giá trị hiện có, vì file
    // Excel xuất ra vốn đã điền sẵn giá trị hiện tại của mọi kệ — tải lên lại nguyên vẹn không đổi gì
    // không được phép kích hoạt lại validate như thể đang gán mới (VD chặn nhầm do NV đã gán từ trước
    // giờ thuộc kho khác — dữ liệu cũ có thể chưa từng qua validate này khi được tạo). Ở Phòng ra rễ,
    // Shelf không có plantTypeId/assignedStaffId (luôn null) nên cột này chỉ dùng để sinh lô mới, không
    // bao giờ coi là "không đổi" — mỗi lần nhập số lượng đều cần chọn lại.
    let plantTypeIdInput: string | null | undefined;
    let resolvedPlantType: ResolvedPlantType | null = null;
    if (parsed.plantTypeCode === "-") {
      plantTypeIdInput = shelf.plantTypeId === null ? undefined : null;
    } else if (parsed.plantTypeCode) {
      const pt = await prisma.plantType.findUnique({
        where: { code: parsed.plantTypeCode },
        select: { id: true, code: true, transferWaitWeeks: true, rootingWeeks: true },
      });
      if (!pt) {
        errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: `Không tìm thấy mã cây "${parsed.plantTypeCode}"` });
        continue;
      }
      resolvedPlantType = pt;
      plantTypeIdInput = isMauMe && pt.id === shelf.plantTypeId ? undefined : pt.id;
    }
    if (!resolvedPlantType && isMauMe && shelf.plantTypeId) {
      resolvedPlantType = await prisma.plantType.findUnique({
        where: { id: shelf.plantTypeId },
        select: { id: true, code: true, transferWaitWeeks: true, rootingWeeks: true },
      });
    }

    // Mã NV phụ trách — cùng quy tắc "chỉ coi là thay đổi thật" như trên (chỉ áp dụng ở Phòng mẫu mẹ,
    // vì đây là field lưu trên Shelf; Phòng ra rễ chỉ dùng mã NV để sinh mã lô, không lưu vào kệ).
    let staffIdInput: string | null | undefined;
    let resolvedStaffCode: string | null = isMauMe ? (shelf.assignedStaff?.code ?? null) : null;
    if (parsed.staffCode === "-") {
      staffIdInput = shelf.assignedStaffId === null ? undefined : null;
      if (staffIdInput === null) resolvedStaffCode = null;
    } else if (parsed.staffCode) {
      const u = await prisma.user.findUnique({ where: { code: parsed.staffCode }, select: { id: true, role: true, code: true } });
      if (!u || u.role !== "CAY_MO") {
        errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: `Không tìm thấy mã NV cấy mô "${parsed.staffCode}"` });
        continue;
      }
      resolvedStaffCode = u.code;
      staffIdInput = isMauMe && u.id === shelf.assignedStaffId ? undefined : u.id;
    }

    // Việc lưu mã cây/mã NV thẳng vào Shelf (+ validate "không đổi mã cây khi còn lô khác loại", "NV
    // phải đúng kho làm việc") chỉ có ý nghĩa ở Phòng mẫu mẹ — Phòng ra rễ 1 kệ có thể chứa nhiều lô
    // khác mã cây cùng lúc nên áp quy tắc đó là sai, bỏ qua hoàn toàn bước này.
    const shelfUpdateData: ShelfAttributeUpdateData & { rotationGroupId?: string | null } = {};
    if (isMauMe) {
      const attrResult = await resolveShelfAttributeUpdate(prisma, shelf.id, {
        plantTypeId: plantTypeIdInput,
        assignedStaffId: staffIdInput,
      });
      if (!attrResult.ok) {
        errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: attrResult.message });
        continue;
      }
      Object.assign(shelfUpdateData, attrResult.data);
    }

    // Nhóm tuần — khớp theo tên trong đúng loại xoay vòng (MAU_ME/RA_RE) của phòng đang nhập. Quy tắc
    // "số khe không vượt quá Thời gian đợi cấy chuyển" (PATCH /api/shelf-groups/[id]/shelves) chỉ áp
    // dụng cho Nhóm tuần mẫu mẹ, Nhóm tuần ra rễ không có ràng buộc số tuần tương ứng. Cùng quy tắc "chỉ
    // coi là thay đổi thật" — nhóm tuần không đổi thì bỏ qua, không validate lại.
    if (parsed.rotationGroupName === "-") {
      if (shelf.rotationGroupId !== null) shelfUpdateData.rotationGroupId = null;
    } else if (parsed.rotationGroupName) {
      const matches = rotationGroupsByName.get(parsed.rotationGroupName);
      if (!matches || matches.length === 0) {
        errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: `Không tìm thấy Nhóm tuần "${parsed.rotationGroupName}"` });
        continue;
      }
      if (matches.length > 1) {
        errors.push({
          row: parsed.row,
          shelfCode: parsed.shelfCode,
          message: `Tên Nhóm tuần "${parsed.rotationGroupName}" trùng nhiều nhóm — đổi tên cho duy nhất trước khi nhập`,
        });
        continue;
      }
      const group = matches[0];
      if (group.id !== shelf.rotationGroupId) {
        if (isMauMe) {
          if (!resolvedPlantType) {
            errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: "Cần Mã cây trước khi xếp vào Nhóm tuần mẫu mẹ" });
            continue;
          }
          if (group.rotationOrder !== null && group.rotationOrder > resolvedPlantType.transferWaitWeeks) {
            errors.push({
              row: parsed.row,
              shelfCode: parsed.shelfCode,
              message: `Nhóm khe ${group.rotationOrder} vượt quá "Thời gian đợi cấy chuyển" (${resolvedPlantType.transferWaitWeeks} tuần) của mã cây ${resolvedPlantType.code}`,
            });
            continue;
          }
        }
        shelfUpdateData.rotationGroupId = group.id;
      }
    }

    // Số lượng — luôn tạo lô mới khi có số lượng (cả 2 loại phòng), giới hạn duy nhất là sức chứa còn
    // lại của kệ (capacity = null nghĩa là không giới hạn).
    let lotPlan: LotPlan | undefined;
    if (parsed.quantity !== undefined) {
      if (!Number.isFinite(parsed.quantity) || parsed.quantity <= 0 || !Number.isInteger(parsed.quantity)) {
        errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: "Số lượng phải là số nguyên dương" });
        continue;
      }
      if (!resolvedPlantType) {
        errors.push({ row: parsed.row, shelfCode: parsed.shelfCode, message: "Cần Mã cây để tạo lô mới cho kệ này" });
        continue;
      }
      if (!parsed.stageCode || !validStageCodes.has(parsed.stageCode)) {
        errors.push({
          row: parsed.row,
          shelfCode: parsed.shelfCode,
          message: `Cần chọn Quy cách ${Array.from(validStageCodes).join(" hoặc ")} khi nhập số lượng cho kệ này`,
        });
        continue;
      }
      const used = sumLotQuantity(shelf.lots) + (claimedShelfUsage.get(shelf.id) ?? 0);
      if (shelf.capacity != null && used + parsed.quantity > shelf.capacity) {
        errors.push({
          row: parsed.row,
          shelfCode: parsed.shelfCode,
          message: `Kệ ${parsed.shelfCode} không đủ chỗ (còn trống ${Math.max(0, shelf.capacity - used)}/${shelf.capacity})`,
        });
        continue;
      }
      claimedShelfUsage.set(shelf.id, used + parsed.quantity);
      lotPlan = { stageCode: parsed.stageCode };
    }

    validRows.push({
      row: parsed.row,
      shelfId: shelf.id,
      shelfUpdateData,
      quantity: parsed.quantity,
      lotPlan,
      plantType: resolvedPlantType,
      staffCode: resolvedStaffCode,
    });
  }

  // ---- Giai đoạn 2: áp dụng các dòng hợp lệ trong 1 transaction ----
  let successCount = 0;
  if (validRows.length > 0) {
    const claimedLotCodes = new Set<string>();
    await prisma.$transaction(async (tx) => {
      for (const vr of validRows) {
        if (Object.keys(vr.shelfUpdateData).length > 0) {
          await tx.shelf.update({ where: { id: vr.shelfId }, data: vr.shelfUpdateData });
        }

        if (vr.lotPlan && vr.plantType) {
          const stageCode = vr.lotPlan.stageCode;
          const base = lotCodeBase({ plantTypeCode: vr.plantType.code, staffCode: vr.staffCode ?? "NV000" });
          // Kiểm tra trùng bằng đọc trước rồi mới ghi (không dùng catch lỗi unique-constraint rồi thử
          // lại) — 1 lệnh ghi thất bại giữa transaction Postgres sẽ khiến TOÀN BỘ transaction rơi vào
          // trạng thái "aborted", các lệnh ghi tiếp theo dù mã khác cũng thất bại theo dù code JS bắt
          // được lỗi đầu tiên. Cùng cách generateLotCode/generateWarehouseCode ở src/lib/codes.ts đang
          // làm (đọc trước, không catch-and-retry).
          let attempt = 0;
          let code = base;
          for (;;) {
            attempt += 1;
            code = attempt === 1 ? base : `${base}-${attempt}`;
            const key = `${code}::${stageCode}`;
            if (attempt > MAX_CODE_ATTEMPTS) throw new Error(`Không sinh được mã lô duy nhất cho kệ ${vr.shelfId}`);
            if (claimedLotCodes.has(key)) continue;
            const existing = await tx.lot.findFirst({ where: { code, stageCode }, select: { id: true } });
            if (existing) continue;
            claimedLotCodes.add(key);
            break;
          }
          await tx.lot.create({
            data: {
              code,
              plantTypeId: vr.plantType.id,
              stage: lotStage,
              stageCode,
              shelfId: vr.shelfId,
              quantity: vr.quantity!,
              initialQuantity: vr.quantity!,
              status: "ACTIVE",
              enteredAt: new Date(),
              expectedMoveAt: addWeeks(new Date(), isMauMe ? vr.plantType.transferWaitWeeks : vr.plantType.rootingWeeks),
            },
          });
        }

        successCount += 1;
      }
    });
  }

  return NextResponse.json({ successCount, errors });
}
