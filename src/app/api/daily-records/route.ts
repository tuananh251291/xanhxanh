import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLotCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";
import { addDays, addWeeks } from "date-fns";

const schema = z.object({
  instructionId: z.string(),
  recordDate: z.string().optional(),
  motherUsed: z.number().int().positive(),
  notes: z.string().optional(),
  items: z.array(z.object({
    stage: z.enum(["MAU_ME", "THANH_PHAM"]),
    stageCode: z.enum(["M3", "M5", "T01", "T05"]),
    quantityCreated: z.number().int().positive(),
  })).min(1)
    .refine(
      (items) => items.every((i) =>
        (i.stage === "MAU_ME" && (i.stageCode === "M3" || i.stageCode === "M5")) ||
        (i.stage === "THANH_PHAM" && (i.stageCode === "T01" || i.stageCode === "T05"))
      ),
      { message: "Quy cách không khớp với giai đoạn (Mẫu mẹ phải là M3/M5, Thành phẩm phải là T01/T05)" }
    ),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { instructionId, recordDate, motherUsed, notes, items } = parsed.data;

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id: instructionId },
    include: { plantType: true },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  if (instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không phải chỉ định của bạn" }, { status: 403 });
  }

  const recordItems = [];
  const lotsCreated = [];

  for (const item of items) {
    let lot;

    // Chỉ định cấy phân bổ theo tuần (1 chỉ định = 1 tuần cấy của NV) — sản lượng trả ra trong cùng
    // tuần này (cùng chỉ định, cùng giai đoạn + quy cách) gộp chung 1 lô thay vì mỗi ngày 1 lô mới,
    // miễn là lô đó chưa được chuyển đi (còn ACTIVE, chưa xếp kệ) — áp dụng cho cả mẫu mẹ (M3/M5) lẫn
    // thành phẩm (T01/T05).
    const existingLot = await prisma.lot.findFirst({
      where: { instructionId, stage: item.stage, stageCode: item.stageCode, status: "ACTIVE", shelfId: null },
      orderBy: { createdAt: "desc" },
    });

    if (existingLot) {
      lot = await prisma.lot.update({
        where: { id: existingLot.id },
        data: {
          quantity: { increment: item.quantityCreated },
          initialQuantity: { increment: item.quantityCreated },
        },
      });
    } else {
      const code = await generateLotCode(item.stage);
      const expectedMoveAt =
        item.stage === "MAU_ME"
          ? addWeeks(new Date(), instruction.plantType.lightRoomWeeksMin)
          : addDays(new Date(), instruction.plantType.finishedDaysMin);
      lot = await prisma.lot.create({
        data: {
          code,
          plantTypeId: instruction.plantTypeId,
          stage: item.stage,
          stageCode: item.stageCode,
          quantity: item.quantityCreated,
          initialQuantity: item.quantityCreated,
          instructionId,
          enteredAt: new Date(),
          expectedMoveAt,
        },
      });
    }
    recordItems.push({ lotId: lot.id, stage: item.stage, quantityCreated: item.quantityCreated });
    lotsCreated.push(lot);
  }

  // Tạo daily record
  const record = await prisma.dailyRecord.create({
    data: {
      instructionId,
      staffId: session.user.id,
      recordDate: recordDate ? new Date(recordDate) : undefined,
      motherUsed,
      notes,
      items: { create: recordItems },
    },
    include: {
      items: { include: { lot: true } },
    },
  });

  // Kiểm tra lệch output — cảnh báo nếu >20%
  let alert = false;
  if (instruction.expectedMotherOutput) {
    const totalMotherRecords = await prisma.dailyRecordItem.aggregate({
      where: {
        dailyRecord: { instructionId },
        stage: "MAU_ME",
      },
      _sum: { quantityCreated: true },
    });
    const totalMother = totalMotherRecords._sum.quantityCreated ?? 0;
    const deviation = Math.abs(totalMother - instruction.expectedMotherOutput) / instruction.expectedMotherOutput;
    if (deviation > 0.2) {
      alert = true;
      await createAlert({
        type: "OUTPUT_DEVIATION",
        title: "Lệch output mẫu mẹ",
        message: `Chỉ định ${instruction.code}: Dự kiến ${instruction.expectedMotherOutput}, thực tế ${totalMother} (lệch ${Math.round(deviation * 100)}%)`,
        targetRole: "KY_THUAT",
        relatedId: instructionId,
        relatedType: "PlantingInstruction",
      });
    }
  }

  return NextResponse.json({ record, lotsCreated, alert }, { status: 201 });
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
      items: { include: { lot: { select: { code: true, stage: true } } } },
    },
    orderBy: { recordDate: "desc" },
    take: 50,
  });
  return NextResponse.json(records);
}
