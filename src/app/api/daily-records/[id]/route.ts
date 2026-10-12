import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageDailyRecords } from "@/types";
import { generateProductLotCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { logContaminationRoomEntry, creditContaminationStaffBalance } from "@/lib/contamination-room";
import { addWeeks } from "date-fns";
import { z } from "zod";

// Sửa nhật ký cấy đã lưu — Admin/Admin cấp cao (mọi kho) hoặc KHO_MO (chỉ đúng NV cùng kho sản xuất
// mình làm việc, xem canManageDailyRecords), dùng khi NV cấy mô nhập sai số liệu (POST /api/daily-records
// không cho NV tự sửa lại — "Đã nhập dữ liệu cho hôm nay, không thể sửa lại"). Xem GET bên dưới cho dữ
// liệu hiển thị form sửa (kèm _count để client tự biết dòng nào đã bị khoá).
// Tách số lượng theo mã cây trong nhóm biến thể của chỉ định — cùng ý nghĩa với m05Variants/t05Variants/
// t01Variants ở POST /api/daily-records. Có truyền thì tổng phải khớp cột gốc (m05/t05/t01) và đây là số
// MỚI cho đúng từng mã; không truyền thì cột gốc là số của mã chỉ định, lô mã biến thể khác giữ nguyên.
const variantBreakdownSchema = z.array(z.object({ plantTypeId: z.string(), quantity: z.number().int().min(0) })).optional();

const editSchema = z.object({
  motherChecked: z.number().int().min(0),
  motherContaminatedM05: z.number().int().min(0),
  motherUsed: z.number().int().min(0),
  m05: z.number().int().min(0),
  t05: z.number().int().min(0),
  t01: z.number().int().min(0),
  m05Variants: variantBreakdownSchema,
  t05Variants: variantBreakdownSchema,
  t01Variants: variantBreakdownSchema,
  notes: z.string().optional(),
});

const STAGE_BY_CODE = { M05: "MAU_ME", T05: "THANH_PHAM", T01: "THANH_PHAM" } as const;
type EditableStageCode = keyof typeof STAGE_BY_CODE;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const record = await prisma.dailyRecord.findUnique({
    where: { id },
    include: {
      instruction: {
        select: {
          code: true,
          plantType: {
            select: {
              id: true, code: true, name: true,
              variantGroup: { select: { members: { select: { id: true, code: true, name: true }, orderBy: { code: "asc" } } } },
            },
          },
          items: { select: { shelf: { select: { warehouseId: true } } }, take: 1 },
        },
      },
      staff: { select: { name: true, code: true } },
      items: {
        include: {
          lot: {
            select: {
              id: true, code: true, stageCode: true, quantity: true, initialQuantity: true, status: true, plantTypeId: true,
              _count: { select: { transferItems: true, inspectionItems: true, contaminations: true } },
            },
          },
        },
      },
    },
  });
  if (!record) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const instructionWarehouseId = record.instruction.items[0]?.shelf?.warehouseId ?? null;
  if (!canManageDailyRecords(session?.user?.role, session?.user?.workplaceWarehouseId, instructionWarehouseId)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  // Lô đã bị động tới ở bất kỳ đâu (bàn giao/kiểm tra nhiễm/nhiễm/đã đổi số lượng) thì dòng quy cách đó
  // không còn sửa được nữa — trả cờ locked để client hiện rõ lý do, không cần đợi PATCH mới biết.
  const locked = record.items.some(
    (i) =>
      i.lot.status !== "ACTIVE" ||
      i.lot.quantity !== i.lot.initialQuantity ||
      i.lot._count.transferItems > 0 ||
      i.lot._count.inspectionItems > 0 ||
      i.lot._count.contaminations > 0
  );

  // instruction.items chỉ dùng nội bộ để xét quyền ở trên — không cần trả về client.
  // Mã cây trong nhóm biến thể (mã của chỉ định đứng đầu) — form sửa tách ô nhập theo từng mã khi có >1 mã.
  const { instruction, ...rest } = record;
  const { variantGroup, ...plantType } = instruction.plantType;
  const members = variantGroup?.members ?? [];
  const variantMembers = members.length > 1
    ? [
        ...members.filter((m) => m.id === plantType.id),
        ...members.filter((m) => m.id !== plantType.id),
      ]
    : [];
  return NextResponse.json({
    ...rest,
    instruction: { code: instruction.code, plantType },
    variantMembers,
    locked,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const body = await req.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { motherChecked, motherContaminatedM05, motherUsed, m05, t05, t01, m05Variants, t05Variants, t01Variants, notes } = parsed.data;

  const record = await prisma.dailyRecord.findUnique({
    where: { id },
    include: {
      instruction: {
        include: {
          plantType: {
            select: {
              code: true, transferWaitWeeks: true, rootingWeeks: true,
              variantGroup: { select: { members: { select: { id: true, code: true, transferWaitWeeks: true, rootingWeeks: true } } } },
            },
          },
          items: { include: { shelf: { select: { warehouseId: true, warehouse: { select: { code: true } } } } } },
        },
      },
      items: { include: { lot: true } },
    },
  });
  if (!record) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  const instructionWarehouseId = record.instruction.items[0]?.shelf?.warehouseId ?? null;
  if (!canManageDailyRecords(session?.user?.role, session?.user?.workplaceWarehouseId, instructionWarehouseId)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  // An toàn: mọi lô đã tạo từ bản ghi này phải CHƯA bị động tới ở bất kỳ đâu khác (bàn giao/kiểm tra
  // nhiễm/nhiễm/đổi số lượng) — mới chắc chắn sửa/xoá/tạo lại lô ở đây không làm sai lệch dữ liệu đã đi
  // xa hơn. Không cố "sửa một phần" — chỉ cần 1 lô đã bị động là chặn toàn bộ, đơn giản và an toàn hơn.
  for (const item of record.items) {
    const lot = item.lot;
    const [transferCount, inspectionCount, contamCount] = await Promise.all([
      prisma.transferItem.count({ where: { lotId: lot.id } }),
      prisma.lotInspectionItem.count({ where: { lotId: lot.id } }),
      prisma.contaminationRecord.count({ where: { lotId: lot.id } }),
    ]);
    if (lot.status !== "ACTIVE" || lot.quantity !== lot.initialQuantity || transferCount > 0 || inspectionCount > 0 || contamCount > 0) {
      return NextResponse.json(
        { message: `Lô ${lot.code} (${lot.stageCode}) đã được xử lý tiếp (kiểm tra nhiễm/bàn giao/đổi số lượng) — không thể sửa nhật ký này nữa` },
        { status: 409 }
      );
    }
  }

  // Tổng "MM đã kiểm tra" luỹ kế cả tuần không vượt quá số mẫu mẹ được cấp — loại giá trị CŨ của chính
  // bản ghi đang sửa ra khỏi tổng trước khi cộng giá trị MỚI vào (giống hệt ràng buộc lúc tạo mới).
  const checkedAgg = await prisma.dailyRecord.aggregate({
    where: { instructionId: record.instructionId, id: { not: id } },
    _sum: { motherChecked: true },
  });
  const cumulativeChecked = (checkedAgg._sum.motherChecked ?? 0) + motherChecked;
  if (cumulativeChecked > record.instruction.inputMotherQuantity) {
    return NextResponse.json(
      { message: `Tổng MM đã kiểm tra (${cumulativeChecked} cụm) vượt quá số mẫu mẹ được cấp cho chỉ định (${record.instruction.inputMotherQuantity} cụm)` },
      { status: 400 }
    );
  }

  const warehouseId = record.instruction.items[0]?.shelf?.warehouseId;
  const warehouseCode = record.instruction.items[0]?.shelf?.warehouse.code;
  if (!warehouseId || !warehouseCode) {
    return NextResponse.json({ message: "Không xác định được kho sản xuất của chỉ định" }, { status: 400 });
  }

  // Giảm "MM mẹ nhiễm" nghĩa là phải trừ lại đúng phần đó khỏi Phòng nhiễm (lô gộp theo kho+mã cây, xem
  // addToContaminationRoom) — chặn nếu Phòng nhiễm không còn đủ (Kho mô có thể đã xử lý bớt qua Đề xuất
  // trồng/hủy từ lúc nhập tới giờ).
  const contamDelta = motherContaminatedM05 - record.motherContaminatedM05;
  const contamLotCode = `NHIEM-${warehouseCode}-${record.instruction.plantType.code}`;
  let contamLotId: string | null = null;
  if (contamDelta !== 0) {
    const contamLot = await prisma.lot.findFirst({ where: { code: contamLotCode, stageCode: "M05" } });
    contamLotId = contamLot?.id ?? null;
    if (contamDelta < 0) {
      const available = contamLot?.quantity ?? 0;
      if (available < -contamDelta) {
        return NextResponse.json(
          { message: `Không thể giảm MM nhiễm — Phòng nhiễm chỉ còn ${available.toLocaleString("vi-VN")} cụm (đã bị Kho mô xử lý bớt), không đủ để trừ lại ${(-contamDelta).toLocaleString("vi-VN")} cụm` },
          { status: 409 }
        );
      }
    }
  }

  // Mỗi dòng nhật ký = 1 lô theo cặp (quy cách, mã cây) — bản ghi có tách mã biến thể (xem POST
  // /api/daily-records) có thể có nhiều lô cùng quy cách khác mã cây.
  const primaryPlantTypeId = record.instruction.plantTypeId;
  const variantMembers = record.instruction.plantType.variantGroup?.members ?? [];
  const plantTypeById = new Map<string, { code: string; transferWaitWeeks: number; rootingWeeks: number }>([
    ...variantMembers.map((m) => [m.id, m] as const),
    [primaryPlantTypeId, record.instruction.plantType],
  ]);
  const keyOf = (stageCode: string, plantTypeId: string) => `${stageCode}::${plantTypeId}`;
  const itemsByKey = new Map(record.items.map((i) => [keyOf(i.lot.stageCode, i.lot.plantTypeId), i]));

  const columns: { stageCode: EditableStageCode; total: number; breakdown: { plantTypeId: string; quantity: number }[] | undefined }[] = [
    { stageCode: "M05", total: m05, breakdown: m05Variants },
    { stageCode: "T05", total: t05, breakdown: t05Variants },
    { stageCode: "T01", total: t01, breakdown: t01Variants },
  ];
  const newQuantities = new Map<string, { stageCode: EditableStageCode; plantTypeId: string; quantity: number }>();
  for (const { stageCode, total, breakdown } of columns) {
    if (breakdown && breakdown.length > 0) {
      if (breakdown.some((b) => !plantTypeById.has(b.plantTypeId))) {
        return NextResponse.json({ message: `Có mã cây phân loại ${stageCode} không thuộc nhóm biến thể của chỉ định` }, { status: 400 });
      }
      const sum = breakdown.reduce((s, b) => s + b.quantity, 0);
      if (sum !== total) {
        return NextResponse.json({ message: `Tổng số lượng phân loại ${stageCode} (${sum}) không khớp số đã nhập ở cột gốc (${total})` }, { status: 400 });
      }
      for (const b of breakdown) newQuantities.set(keyOf(stageCode, b.plantTypeId), { stageCode, plantTypeId: b.plantTypeId, quantity: b.quantity });
    } else {
      newQuantities.set(keyOf(stageCode, primaryPlantTypeId), { stageCode, plantTypeId: primaryPlantTypeId, quantity: total });
    }
  }
  // Lô mã biến thể đang có nhưng client không gửi số (form cũ không tách mã) — giữ nguyên số hiện tại.
  for (const item of record.items) {
    const key = keyOf(item.lot.stageCode, item.lot.plantTypeId);
    if (!newQuantities.has(key)) {
      newQuantities.set(key, { stageCode: item.lot.stageCode as EditableStageCode, plantTypeId: item.lot.plantTypeId, quantity: item.lot.quantity });
    }
  }

  // Có thực sự đổi số liệu không (bấm Lưu nhưng không sửa gì thì không tính là "nhập sai") — dùng để
  // quyết định có ghi DailyRecordEdit hay không (đếm "số lần nhập sai dữ liệu trong tuần" của NV, xem
  // getCayMoStats ở dashboard/page.tsx và /data-corrections).
  const changed =
    motherUsed !== record.motherUsed ||
    motherChecked !== record.motherChecked ||
    motherContaminatedM05 !== record.motherContaminatedM05 ||
    [...newQuantities].some(([key, v]) => v.quantity !== (itemsByKey.get(key)?.lot.quantity ?? 0));

  // Cần sẵn Phòng tối cá nhân của NV này TRƯỚC nếu có dòng quy cách mới cần tạo lô (đọc ngoài transaction,
  // giống nguyên bản POST — hàm này tự idempotent, không có gì để rollback nếu phần sau lỗi).
  const needsNewLot = [...newQuantities].some(([key, v]) => !itemsByKey.has(key) && v.quantity > 0);
  const personalRoom = needsNewLot ? await getOrCreatePersonalDarkRoom(record.staffId, warehouseId) : null;
  const productLotCode = needsNewLot ? generateProductLotCode(record.instruction.code, record.recordDate) : null;

  await prisma.$transaction(async (tx) => {
    for (const [key, { stageCode, plantTypeId, quantity: newQty }] of newQuantities) {
      const existing = itemsByKey.get(key);

      if (existing) {
        if (newQty === 0) {
          // NV nhập nhầm có, thực ra không có — xoá hẳn lô + dòng nhật ký con (đã xác nhận an toàn ở trên).
          await tx.dailyRecordItem.delete({ where: { id: existing.id } });
          await tx.lot.delete({ where: { id: existing.lot.id } });
        } else if (newQty !== existing.lot.quantity) {
          await tx.lot.update({ where: { id: existing.lot.id }, data: { quantity: newQty, initialQuantity: newQty } });
          await tx.dailyRecordItem.update({ where: { id: existing.id }, data: { quantityCreated: newQty } });
        }
      } else if (newQty > 0) {
        // NV bỏ sót hẳn 1 quy cách — tạo lô mới, giữ nguyên enteredAt = ngày nhật ký gốc (recordDate),
        // không dùng ngày hôm nay như lúc NV tự nhập.
        // Lô mã biến thể thêm hậu tố mã cây — cùng quy ước với POST /api/daily-records, tránh trùng
        // (code, stageCode) với lô mã chỉ định cùng ngày.
        const stage = STAGE_BY_CODE[stageCode];
        const itemPlantType = plantTypeById.get(plantTypeId)!;
        const expectedMoveAt =
          stage === "MAU_ME"
            ? addWeeks(record.recordDate, itemPlantType.transferWaitWeeks)
            : addWeeks(record.recordDate, itemPlantType.rootingWeeks);
        const lot = await tx.lot.create({
          data: {
            code: plantTypeId === primaryPlantTypeId ? productLotCode! : `${productLotCode}-${itemPlantType.code}`,
            plantTypeId,
            stage,
            stageCode,
            quantity: newQty,
            initialQuantity: newQty,
            instructionId: record.instructionId,
            roomId: personalRoom!.id,
            enteredAt: record.recordDate,
            darkRoomEnteredAt: record.recordDate,
            expectedMoveAt,
          },
        });
        await tx.dailyRecordItem.create({ data: { dailyRecordId: id, lotId: lot.id, stage, quantityCreated: newQty } });
      }
    }

    if (contamDelta !== 0) {
      // Nguồn tham chiếu để truy vết (không bắt buộc phải có) — lô M05 của chính bản ghi này nếu còn.
      const m05LotCode = itemsByKey.get(keyOf("M05", primaryPlantTypeId))?.lot.code ?? null;
      if (contamDelta > 0) {
        if (contamLotId) {
          await tx.lot.update({ where: { id: contamLotId }, data: { quantity: { increment: contamDelta }, initialQuantity: { increment: contamDelta } } });
        } else {
          const room = await tx.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
          if (room) {
            const created = await tx.lot.create({
              data: {
                code: contamLotCode,
                plantTypeId: record.instruction.plantTypeId,
                stage: "MAU_ME",
                stageCode: "M05",
                roomId: room.id,
                quantity: contamDelta,
                initialQuantity: contamDelta,
                status: "ACTIVE",
              },
            });
            contamLotId = created.id;
          }
        }
        if (contamLotId) {
          await logContaminationRoomEntry(tx, {
            contaminationLotId: contamLotId,
            quantity: contamDelta,
            sourceLotCode: m05LotCode,
            reportedById: session!.user!.id,
            reason: "DAILY_RECORD_EDIT",
          });
          await creditContaminationStaffBalance(tx, {
            warehouseId, staffId: record.staffId, plantTypeId: record.instruction.plantTypeId, stageCode: "M05", category: "DANG_THUC_HIEN", quantity: contamDelta,
          });
        }
      } else if (contamLotId) {
        await tx.lot.update({ where: { id: contamLotId }, data: { quantity: { decrement: -contamDelta }, initialQuantity: { decrement: -contamDelta } } });
        await logContaminationRoomEntry(tx, {
          contaminationLotId: contamLotId,
          quantity: contamDelta,
          sourceLotCode: m05LotCode,
          reportedById: session!.user!.id,
          reason: "DAILY_RECORD_EDIT",
        });
        await creditContaminationStaffBalance(tx, {
          warehouseId, staffId: record.staffId, plantTypeId: record.instruction.plantTypeId, stageCode: "M05", category: "DANG_THUC_HIEN", quantity: contamDelta,
        });
      }
    }

    await tx.dailyRecord.update({
      where: { id },
      data: { motherUsed, motherChecked, motherContaminatedM05, notes },
    });

    if (changed) {
      await tx.dailyRecordEdit.create({
        data: { dailyRecordId: id, staffId: record.staffId, editedById: session!.user!.id },
      });
    }
  });

  return NextResponse.json({ success: true });
}
