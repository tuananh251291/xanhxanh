import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canManageDailyRecords } from "@/types";
import { generateProductLotCode } from "@/lib/codes";
import { getOrCreatePersonalDarkRoom } from "@/lib/dark-room";
import { addWeeks } from "date-fns";
import { z } from "zod";

// Sửa nhật ký cấy đã lưu — Admin/Admin cấp cao (mọi kho) hoặc KHO_MO (chỉ đúng NV cùng kho sản xuất
// mình làm việc, xem canManageDailyRecords), dùng khi NV cấy mô nhập sai số liệu (POST /api/daily-records
// không cho NV tự sửa lại — "Đã nhập dữ liệu cho hôm nay, không thể sửa lại"). Xem GET bên dưới cho dữ
// liệu hiển thị form sửa (kèm _count để client tự biết dòng nào đã bị khoá).
const editSchema = z.object({
  motherChecked: z.number().int().min(0),
  motherContaminatedM05: z.number().int().min(0),
  motherUsed: z.number().int().min(0),
  m05: z.number().int().min(0),
  t05: z.number().int().min(0),
  t01: z.number().int().min(0),
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
          plantType: { select: { code: true, name: true } },
          items: { select: { shelf: { select: { warehouseId: true } } }, take: 1 },
        },
      },
      staff: { select: { name: true, code: true } },
      items: {
        include: {
          lot: {
            select: {
              id: true, code: true, stageCode: true, quantity: true, initialQuantity: true, status: true,
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
  const { instruction, ...rest } = record;
  return NextResponse.json({
    ...rest,
    instruction: { code: instruction.code, plantType: instruction.plantType },
    locked,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;

  const body = await req.json();
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const { motherChecked, motherContaminatedM05, motherUsed, m05, t05, t01, notes } = parsed.data;

  const record = await prisma.dailyRecord.findUnique({
    where: { id },
    include: {
      instruction: {
        include: {
          plantType: { select: { code: true, transferWaitWeeks: true, rootingWeeks: true } },
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

  const itemsByStageCode = new Map(record.items.map((i) => [i.lot.stageCode as EditableStageCode, i]));
  const newQuantities: Record<EditableStageCode, number> = { M05: m05, T05: t05, T01: t01 };

  // Cần sẵn Phòng tối cá nhân của NV này TRƯỚC nếu có dòng quy cách mới cần tạo lô (đọc ngoài transaction,
  // giống nguyên bản POST — hàm này tự idempotent, không có gì để rollback nếu phần sau lỗi).
  const needsNewLot = (Object.keys(newQuantities) as EditableStageCode[]).some(
    (code) => !itemsByStageCode.has(code) && newQuantities[code] > 0
  );
  const personalRoom = needsNewLot ? await getOrCreatePersonalDarkRoom(record.staffId, warehouseId) : null;
  const productLotCode = needsNewLot ? generateProductLotCode(record.instruction.code, record.recordDate) : null;

  await prisma.$transaction(async (tx) => {
    for (const stageCode of Object.keys(newQuantities) as EditableStageCode[]) {
      const existing = itemsByStageCode.get(stageCode);
      const newQty = newQuantities[stageCode];

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
        const stage = STAGE_BY_CODE[stageCode];
        const expectedMoveAt =
          stage === "MAU_ME"
            ? addWeeks(record.recordDate, record.instruction.plantType.transferWaitWeeks)
            : addWeeks(record.recordDate, record.instruction.plantType.rootingWeeks);
        const lot = await tx.lot.create({
          data: {
            code: productLotCode!,
            plantTypeId: record.instruction.plantTypeId,
            stage,
            stageCode,
            quantity: newQty,
            initialQuantity: newQty,
            instructionId: record.instructionId,
            roomId: personalRoom!.id,
            enteredAt: record.recordDate,
            expectedMoveAt,
          },
        });
        await tx.dailyRecordItem.create({ data: { dailyRecordId: id, lotId: lot.id, stage, quantityCreated: newQty } });
      }
    }

    if (contamDelta !== 0) {
      if (contamDelta > 0) {
        if (contamLotId) {
          await tx.lot.update({ where: { id: contamLotId }, data: { quantity: { increment: contamDelta }, initialQuantity: { increment: contamDelta } } });
        } else {
          const room = await tx.room.findFirst({ where: { warehouseId, type: "PHONG_NHIEM" } });
          if (room) {
            await tx.lot.create({
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
          }
        }
      } else if (contamLotId) {
        await tx.lot.update({ where: { id: contamLotId }, data: { quantity: { decrement: -contamDelta }, initialQuantity: { decrement: -contamDelta } } });
      }
    }

    await tx.dailyRecord.update({
      where: { id },
      data: { motherUsed, motherChecked, motherContaminatedM05, notes },
    });
  });

  return NextResponse.json({ success: true });
}
