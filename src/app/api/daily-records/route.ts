import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLotCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";
import { addDays, addWeeks } from "date-fns";

const schema = z.object({
  instructionId: z.string(),
  motherUsed: z.number().int().positive(),
  motherCreated: z.number().int().min(0),
  finishedCreated: z.number().int().min(0),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "CAY_MO") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { instructionId, motherUsed, motherCreated, finishedCreated, notes } = parsed.data;

  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id: instructionId },
    include: { plantType: true },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  if (instruction.assignedToId !== session.user.id) {
    return NextResponse.json({ message: "Không phải chỉ định của bạn" }, { status: 403 });
  }

  // Tìm kho phòng tối
  const darkRoom = await prisma.warehouse.findFirst({ where: { type: "PHONG_TOI" } });

  const recordItems = [];
  const lotsCreated = [];

  // Tạo Lot mẫu mẹ mới nếu có
  if (motherCreated > 0) {
    const code = await generateLotCode("MAU_ME");
    const expectedMoveAt = addWeeks(new Date(), instruction.plantType.lightRoomWeeksMin);
    const lot = await prisma.lot.create({
      data: {
        code,
        plantTypeId: instruction.plantTypeId,
        stage: "MAU_ME",
        stageCode: "M3",
        quantity: motherCreated,
        initialQuantity: motherCreated,
        instructionId,
        enteredAt: new Date(),
        expectedMoveAt,
      },
    });
    recordItems.push({ lotId: lot.id, stage: "MAU_ME" as const, quantityCreated: motherCreated });
    lotsCreated.push(lot);
  }

  // Tạo Lot thành phẩm mới nếu có
  if (finishedCreated > 0) {
    const code = await generateLotCode("THANH_PHAM");
    const expectedMoveAt = addDays(new Date(), instruction.plantType.finishedDaysMin);
    const lot = await prisma.lot.create({
      data: {
        code,
        plantTypeId: instruction.plantTypeId,
        stage: "THANH_PHAM",
        stageCode: "T01",
        quantity: finishedCreated,
        initialQuantity: finishedCreated,
        instructionId,
        enteredAt: new Date(),
        expectedMoveAt,
      },
    });
    recordItems.push({ lotId: lot.id, stage: "THANH_PHAM" as const, quantityCreated: finishedCreated });
    lotsCreated.push(lot);
  }

  // Tạo daily record
  const record = await prisma.dailyRecord.create({
    data: {
      instructionId,
      staffId: session.user.id,
      motherUsed,
      notes,
      items: { create: recordItems },
    },
    include: {
      items: { include: { lot: true } },
    },
  });

  // Kiểm tra lệch output — cảnh báo nếu >20%
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

  return NextResponse.json({ record, lotsCreated }, { status: 201 });
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
