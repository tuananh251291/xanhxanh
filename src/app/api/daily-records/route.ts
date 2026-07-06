import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateProductLotCode } from "@/lib/codes";
import { createAlert, getSystemConfig } from "@/lib/inventory";
import { getOrCreatePersonalDarkRoomShelf } from "@/lib/dark-room";
import { z } from "zod";
import { addWeeks, startOfDay, endOfDay, startOfWeek, endOfWeek, differenceInCalendarDays, isSameDay } from "date-fns";

// Tiến độ cấy chuyển được tính theo 6 ngày làm việc (Thứ 2 - Thứ 7) — Chủ nhật là ngày làm thêm tùy chọn
// nên không cộng thêm vào chỉ tiêu cần đạt (chặn ở mức của ngày Thứ 7 = tổng dự kiến cả tuần).
const WORKING_DAYS_PER_WEEK = 6;
const STAGE_KEYS = ["m03", "m05", "t05", "t01"] as const;
type StageKey = (typeof STAGE_KEYS)[number];
const STAGE_LABELS: Record<StageKey, string> = { m03: "M03", m05: "M05", t05: "T05", t01: "T01" };

const schema = z.object({
  instructionId: z.string(),
  motherChecked: z.number().int().min(0),
  motherContaminated: z.number().int().min(0),
  motherUsed: z.number().int().min(0),
  m03: z.number().int().min(0),
  m05: z.number().int().min(0),
  t05: z.number().int().min(0),
  t01: z.number().int().min(0),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { instructionId, motherChecked, motherContaminated, motherUsed, m03, m05, t05, t01, notes } = parsed.data;

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id: instructionId },
    include: { plantType: true, items: { include: { shelf: { select: { warehouseId: true } } } } },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  if (instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không phải chỉ định của bạn" }, { status: 403 });
  }

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  if (!instruction.weekStart || instruction.weekStart < weekStart || instruction.weekStart > weekEnd) {
    return NextResponse.json({ message: "Chỉ định này không thuộc tuần thực tế" }, { status: 400 });
  }

  // Mỗi ngày chỉ được nhập 1 lần — đã điền xong (có bản ghi hôm nay) thì không cho nhập/sửa lại.
  const existingToday = await prisma.dailyRecord.findFirst({
    where: {
      instructionId,
      staffId: session.user.id,
      recordDate: { gte: startOfDay(today), lte: endOfDay(today) },
    },
  });
  if (existingToday) {
    return NextResponse.json({ message: "Đã nhập dữ liệu cho hôm nay, không thể sửa lại" }, { status: 409 });
  }

  // Lô sản xuất ra tự động chuyển vào Phòng tối CÁ NHÂN của NV cấy mô ngay khi nhập dữ liệu — không
  // cần đợi bàn giao mới có chỗ. Suy ra đúng kho sản xuất từ giàn kệ nguồn của chỉ định.
  const warehouseId = instruction.items[0]?.shelf?.warehouseId;
  if (!warehouseId) {
    return NextResponse.json({ message: "Không xác định được kho sản xuất của chỉ định" }, { status: 400 });
  }
  const personalShelf = await getOrCreatePersonalDarkRoomShelf(session.user.id, warehouseId);

  const items = ([
    { stage: "MAU_ME" as const, stageCode: "M03" as const, quantityCreated: m03 },
    { stage: "MAU_ME" as const, stageCode: "M05" as const, quantityCreated: m05 },
    { stage: "THANH_PHAM" as const, stageCode: "T05" as const, quantityCreated: t05 },
    { stage: "THANH_PHAM" as const, stageCode: "T01" as const, quantityCreated: t01 },
  ]).filter((i) => i.quantityCreated > 0);

  const recordItems = [];
  const lotsCreated = [];

  // Lô sản phẩm: mỗi ngày trong tuần chỉ định luôn tạo 1 lô riêng (mã = mã chỉ định + 1 ký tự 2-8 ứng
  // với Thứ 2 - Chủ nhật của ngày nhập) — không gộp nhiều ngày vào 1 lô như trước. "Mỗi ngày chỉ được
  // nhập 1 lần" (existingToday ở trên) nên không lo trùng mã trong cùng 1 chỉ định.
  const productLotCode = generateProductLotCode(instruction.code, today);

  for (const item of items) {
    const expectedMoveAt =
      item.stage === "MAU_ME"
        ? addWeeks(new Date(), instruction.plantType.transferWaitWeeks)
        : addWeeks(new Date(), instruction.plantType.rootingWeeks);
    const lot = await prisma.lot.create({
      data: {
        code: productLotCode,
        plantTypeId: instruction.plantTypeId,
        stage: item.stage,
        stageCode: item.stageCode,
        quantity: item.quantityCreated,
        initialQuantity: item.quantityCreated,
        instructionId,
        shelfId: personalShelf.id,
        enteredAt: new Date(),
        expectedMoveAt,
      },
    });
    recordItems.push({ lotId: lot.id, stage: item.stage, quantityCreated: item.quantityCreated });
    lotsCreated.push(lot);
  }

  // Tạo daily record — recordDate luôn là hôm nay (chỉ được nhập vào dòng của ngày hôm đó).
  const record = await prisma.dailyRecord.create({
    data: {
      instructionId,
      staffId: session.user.id,
      recordDate: today,
      motherUsed,
      motherChecked,
      motherContaminated,
      notes,
      items: { create: recordItems },
    },
    include: {
      items: { include: { lot: true } },
    },
  });

  // Kiểm tra tiến độ cấy theo từng quy cách (M03/M05/T05/T01) so với mức trung bình cần đạt mỗi ngày
  // (dự kiến cả tuần / 6 ngày), tính lũy kế tới hôm nay — chỉ cần 1 quy cách hụt dưới ngưỡng "Tỉ lệ cấy
  // cần đạt" (Admin cấu hình ở Cài đặt) là coi như lệch, cảnh báo cho KY_THUAT xử lý.
  const targetPct = parseFloat(await getSystemConfig("planting_ratio_target_pct", "80")) || 80;
  const elapsedDays = Math.min(differenceInCalendarDays(today, instruction.weekStart) + 1, WORKING_DAYS_PER_WEEK);

  const expectedByStage: Record<StageKey, number> = {
    m03: instruction.items.filter((i) => i.stageCode === "M03").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0),
    m05: instruction.items.filter((i) => i.stageCode === "M05").reduce((s, i) => s + (i.expectedMotherOutput ?? 0), 0),
    t05: instruction.plannedT05Quantity ?? 0,
    t01: instruction.plannedT01Quantity ?? 0,
  };

  const itemsByStage = await prisma.dailyRecordItem.findMany({
    where: { dailyRecord: { instructionId } },
    include: { lot: { select: { stageCode: true } } },
  });
  const actualByStage: Record<StageKey, number> = { m03: 0, m05: 0, t05: 0, t01: 0 };
  for (const i of itemsByStage) {
    const key = i.lot.stageCode.toLowerCase() as StageKey;
    if (key in actualByStage) actualByStage[key] += i.quantityCreated;
  }

  const behindStages = STAGE_KEYS.filter((key) => {
    const expected = expectedByStage[key];
    if (!expected) return false;
    const expectedToDate = (expected / WORKING_DAYS_PER_WEEK) * elapsedDays;
    return actualByStage[key] / expectedToDate < targetPct / 100;
  });

  let alert = false;
  if (behindStages.length > 0) {
    alert = true;
    const detail = behindStages
      .map((key) => {
        const expectedToDate = Math.round((expectedByStage[key] / WORKING_DAYS_PER_WEEK) * elapsedDays);
        return `${STAGE_LABELS[key]}: ${actualByStage[key]}/${expectedToDate}`;
      })
      .join(", ");
    await createAlert({
      type: "OUTPUT_DEVIATION",
      title: "Cấy lệch tiến độ so với chỉ định",
      message: `Chỉ định ${instruction.code}: đang cấy chậm hơn ${targetPct}% tiến độ cần đạt — ${detail}`,
      targetRole: "KY_THUAT",
      relatedId: instructionId,
      relatedType: "PlantingInstruction",
    });
  }

  // Tự động chuyển chỉ định sang "Kết thúc" ngay khi thao tác Lưu, nếu xảy ra 1 trong 2 trường hợp:
  // 1. Đã dùng hết mẫu mẹ được cấp (tổng "MM sử dụng" >= inputMotherQuantity) — ưu tiên kiểm tra trước
  //    vì trường hợp này không còn dư gì để bàn giao.
  // 2. Hôm nay là Chủ nhật của tuần chỉ định — chỉ kiểm tra tại đúng thời điểm Lưu này (không có cơ chế
  //    quét nền/cron), nên nếu NV không lưu vào đúng Chủ nhật thì chỉ định sẽ không tự kết thúc qua đây.
  let ended = false;
  let endReason: "MOTHER_USED_UP" | "TIME_UP" | null = null;
  if (instruction.status !== "ENDED") {
    const motherUsedAgg = await prisma.dailyRecord.aggregate({
      where: { instructionId },
      _sum: { motherUsed: true },
    });
    const totalMotherUsed = motherUsedAgg._sum.motherUsed ?? 0;

    if (totalMotherUsed >= instruction.inputMotherQuantity) {
      endReason = "MOTHER_USED_UP";
    } else if (isSameDay(today, weekEnd)) {
      endReason = "TIME_UP";
    }

    if (endReason) {
      await prisma.plantingInstruction.update({
        where: { id: instructionId },
        data: { status: "ENDED", endReason },
      });
      ended = true;
    }
  }

  return NextResponse.json({ record, lotsCreated, alert, ended, endReason }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const instructionId = searchParams.get("instructionId");
  const where: Record<string, unknown> = {};
  if (session.user.role === "CAY_MO") where.staffId = session.user.id;
  if (instructionId) where.instructionId = instructionId;

  const records = await prisma.dailyRecord.findMany({
    where,
    include: {
      staff: { select: { name: true } },
      instruction: { select: { code: true, plantType: { select: { name: true } } } },
      items: { include: { lot: { select: { code: true, stage: true, stageCode: true } } } },
    },
    orderBy: { recordDate: "desc" },
    take: 50,
  });
  return NextResponse.json(records);
}
