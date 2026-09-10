import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLotCode, generateInstructionCode } from "@/lib/codes";
import { getOrCreateRndWarehouse, getOrCreateRndInputShelf } from "@/lib/rnd-instruction-warehouse";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek } from "date-fns";
import { z } from "zod";

// "Tự tạo chỉ định cấy cho tôi" — Admin kỹ thuật tự tạo 1 chỉ định cấy THẬT cho chính mình tại "Kho SX
// R&D" (xem src/lib/rnd-instruction-warehouse.ts), dùng mã cây/môi trường CÓ SẴN (không phải giống mới,
// khác hẳn TrialVariety/TrialCultivationRound — feature đó tách biệt hoàn toàn khỏi kho thật). Gộp cả 3
// bước "tạo → bàn giao → nhận mẫu mẹ" thành 1 hành động duy nhất trong 1 transaction, vì Admin kỹ thuật
// tự đóng cả 3 vai trò cho chỉ định của chính mình — sau khi tạo xong, sẵn sàng nhập dữ liệu cấy ngay
// (xem POST /api/daily-records, đã mở quyền cho isAdminRole từ trước, không cần sửa gì thêm).
const createSchema = z.object({
  plantTypeId: z.string().min(1, "Cần chọn mã cây"),
  mediumTypeId: z.string().min(1, "Cần chọn môi trường"),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
});

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const instructions = await prisma.plantingInstruction.findMany({
    where: { createdById: session.user.id, items: { some: { shelf: { warehouse: { isRnd: true } } } } },
    select: {
      id: true,
      code: true,
      status: true,
      weekStart: true,
      inputMotherQuantity: true,
      createdAt: true,
      previousInstructionId: true,
      plantType: { select: { code: true, name: true, transferWaitWeeks: true } },
      items: { select: { motherMedium: { select: { code: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ instructions });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { plantTypeId, mediumTypeId, quantity } = parsed.data;

  const [plantType, mediumType, staff] = await Promise.all([
    prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { code: true } }),
    prisma.mediumType.findUnique({ where: { id: mediumTypeId }, select: { id: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { code: true } }),
  ]);
  if (!plantType) return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  if (!mediumType) return NextResponse.json({ message: "Không tìm thấy môi trường" }, { status: 400 });

  const rndWarehouse = await getOrCreateRndWarehouse();
  const bucketShelf = await getOrCreateRndInputShelf(rndWarehouse.id);

  const now = new Date();
  const weekStart = toStoredWeekStart(startOfWeek(now, { weekStartsOn: 1 }));
  const lotCode = await generateLotCode({ plantTypeCode: plantType.code, staffCode: staff.code, stageCode: "M05" });
  const instructionCode = await generateInstructionCode({ warehouseCode: rndWarehouse.code, shelfCode: bucketShelf.code });

  const instruction = await prisma.$transaction(async (tx) => {
    const lot = await tx.lot.create({
      data: {
        code: lotCode,
        plantTypeId,
        stage: "MAU_ME",
        stageCode: "M05",
        shelfId: bucketShelf.id,
        quantity,
        initialQuantity: quantity,
        status: "PLANTED",
      },
    });

    return tx.plantingInstruction.create({
      data: {
        code: instructionCode,
        plantTypeId,
        createdById: session.user.id,
        assignedToId: session.user.id,
        inputMotherQuantity: quantity,
        status: "ACTIVE",
        weekStart,
        handedOverAt: now,
        handedOverById: session.user.id,
        motherReceivedAt: now,
        items: {
          create: {
            shelfId: bucketShelf.id,
            lotId: lot.id,
            stageCode: "M05",
            quantity,
            motherMediumTypeId: mediumTypeId,
          },
        },
      },
    });
  });

  return NextResponse.json(instruction, { status: 201 });
}
