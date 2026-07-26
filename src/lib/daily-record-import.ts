import type { Prisma } from "@prisma/client";
import { addWeeks, isSameDay } from "date-fns";
import { generateProductLotCode } from "@/lib/codes";
import { addToContaminationRoom } from "@/lib/contamination-room";

// Logic dùng chung cho nghiệp vụ "1 ngày cấy" khi nhập Excel hàng loạt — dùng bởi cả
// api/data-import/daily-records (backfill ngày cho chỉ định đã có) và api/data-import/instructions
// (tạo chỉ định kèm luôn các ngày cấy đã phát sinh nếu chỉ định đó đang hoạt động). Tách riêng để 2 nơi
// không lệch nhau quy tắc cộng dồn MM đã kiểm tra/sử dụng, Phòng nhiễm, và điều kiện tự kết thúc chỉ định.

export type DailyRecordDayNumberFields = {
  motherChecked?: string;
  motherContaminatedM05?: string;
  motherUsed?: string;
  m05?: string;
  t05?: string;
  t01?: string;
};

export type DailyRecordDayNumbers = {
  motherChecked: number;
  motherContaminatedM05: number;
  motherUsed: number;
  m05: number;
  t05: number;
  t01: number;
};

// Trả undefined cho từng cột trống (= 0), báo lỗi rõ theo tên cột nếu có điền nhưng không phải số
// nguyên không âm — giữ đúng thông điệp lỗi đã dùng trong api/data-import/daily-records từ trước.
export function parseDailyRecordNumbers(fields: DailyRecordDayNumberFields): { error: string } | { numbers: DailyRecordDayNumbers } {
  const numericFields: [string, string | undefined][] = [
    ["MM đã kiểm tra (cụm)", fields.motherChecked],
    ["MM nhiễm (cụm)", fields.motherContaminatedM05],
    ["MM sử dụng (cụm)", fields.motherUsed],
    ["M05 mới cấy (cụm)", fields.m05],
    ["T05 thành phẩm (cây)", fields.t05],
    ["T01 thành phẩm (cây)", fields.t01],
  ];
  const values: number[] = [];
  for (const [label, raw] of numericFields) {
    if (!raw) {
      values.push(0);
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { error: `${label} phải là số nguyên không âm` };
    }
    values.push(n);
  }
  const [motherChecked, motherContaminatedM05, motherUsed, m05, t05, t01] = values;
  return { numbers: { motherChecked, motherContaminatedM05, motherUsed, m05, t05, t01 } };
}

export function hasAnyDailyRecordDayValue(fields: DailyRecordDayNumberFields & { notes?: string }, recordDateRaw: unknown): boolean {
  if (recordDateRaw !== null && recordDateRaw !== undefined && recordDateRaw !== "") return true;
  return !!(
    fields.motherChecked || fields.motherContaminatedM05 || fields.motherUsed ||
    fields.m05 || fields.t05 || fields.t01 || fields.notes
  );
}

// MOTHER_USED_UP ưu tiên hơn TIME_UP nếu cùng lúc xảy ra ở dòng cuối tuần — giống hệt thứ tự kiểm tra
// trong api/data-import/daily-records và POST /api/daily-records.
export function computeEndReason(
  newMotherUsed: number,
  inputMotherQuantity: number,
  recordDate: Date,
  weekEndOfInst: Date
): "MOTHER_USED_UP" | "TIME_UP" | null {
  if (newMotherUsed >= inputMotherQuantity) return "MOTHER_USED_UP";
  if (isSameDay(recordDate, weekEndOfInst)) return "TIME_UP";
  return null;
}

export type ApplyDailyRecordDayParams = {
  instructionId: string;
  instructionCode: string;
  assignedToId: string;
  recordDate: Date;
  numbers: DailyRecordDayNumbers;
  notes?: string;
  plantTypeId: string;
  plantTypeCode: string;
  transferWaitWeeks: number;
  rootingWeeks: number;
  warehouseId: string;
  warehouseCode: string;
  personalRoomId: string;
  endReason: "MOTHER_USED_UP" | "TIME_UP" | null;
};

// Tạo Lô sản phẩm (Phòng tối cá nhân NV) + DailyRecord + cộng dồn Phòng nhiễm cho 1 ngày cấy, và tự
// chuyển chỉ định "Kết thúc" nếu endReason đã tính sẵn — PHẢI chạy trong transaction (client truyền vào
// là tx), không dùng prisma toàn cục.
export async function applyDailyRecordDay(tx: Prisma.TransactionClient, p: ApplyDailyRecordDayParams): Promise<void> {
  const productLotCode = generateProductLotCode(p.instructionCode, p.recordDate);

  const stageItems = (
    [
      { stage: "MAU_ME" as const, stageCode: "M05" as const, quantity: p.numbers.m05 },
      { stage: "THANH_PHAM" as const, stageCode: "T05" as const, quantity: p.numbers.t05 },
      { stage: "THANH_PHAM" as const, stageCode: "T01" as const, quantity: p.numbers.t01 },
    ]
  ).filter((i) => i.quantity > 0);

  const recordItems: { lotId: string; stage: "MAU_ME" | "THANH_PHAM"; quantityCreated: number }[] = [];
  for (const item of stageItems) {
    const expectedMoveAt = item.stage === "MAU_ME" ? addWeeks(p.recordDate, p.transferWaitWeeks) : addWeeks(p.recordDate, p.rootingWeeks);
    const lot = await tx.lot.create({
      data: {
        code: productLotCode,
        plantTypeId: p.plantTypeId,
        stage: item.stage,
        stageCode: item.stageCode,
        quantity: item.quantity,
        initialQuantity: item.quantity,
        instructionId: p.instructionId,
        roomId: p.personalRoomId,
        enteredAt: p.recordDate,
        expectedMoveAt,
      },
    });
    recordItems.push({ lotId: lot.id, stage: item.stage, quantityCreated: item.quantity });
  }

  await tx.dailyRecord.create({
    data: {
      instructionId: p.instructionId,
      staffId: p.assignedToId,
      recordDate: p.recordDate,
      motherUsed: p.numbers.motherUsed,
      motherChecked: p.numbers.motherChecked,
      motherContaminatedM05: p.numbers.motherContaminatedM05,
      notes: p.notes,
      items: { create: recordItems },
    },
  });

  await addToContaminationRoom(tx, {
    warehouseId: p.warehouseId,
    warehouseCode: p.warehouseCode,
    plantTypeId: p.plantTypeId,
    plantTypeCode: p.plantTypeCode,
    stage: "MAU_ME",
    stageCode: "M05",
    quantity: p.numbers.motherContaminatedM05,
  });

  if (p.endReason) {
    await tx.plantingInstruction.update({ where: { id: p.instructionId }, data: { status: "ENDED", endReason: p.endReason } });
  }
}
