import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateLotCode, generateInstructionCode } from "@/lib/codes";
import { getOrCreateRndWarehouse, getOrCreateRndInputShelf } from "@/lib/rnd-instruction-warehouse";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek } from "date-fns";
import { z } from "zod";

// "Tạo chỉ định cấy R&D" — Admin kỹ thuật tạo 1 chỉ định cấy THẬT tại "Kho SX R&D" (xem
// src/lib/rnd-instruction-warehouse.ts), dùng mã cây/môi trường CÓ SẴN (không phải giống mới, khác hẳn
// TrialVariety/TrialCultivationRound — feature đó tách biệt hoàn toàn khỏi kho thật). Giao cho CHÍNH MÌNH
// (mặc định, không truyền assignedToId) hoặc cho 1 NV cấy mô THẬT đã được gán làm việc tại R&D (sửa
// 23/09/2026 — trước đây chỉ tự giao cho chính mình). Gộp cả 3 bước "tạo → bàn giao → nhận mẫu mẹ" thành 1
// hành động duy nhất trong 1 transaction — kể cả khi giao cho NV khác, Admin kỹ thuật vẫn tự chịu trách
// nhiệm xác nhận đã bàn giao thật (giống hệt Kho mô bàn giao mẫu mẹ cho NV ở luồng cấy thường), NV chỉ cần
// vào nhập dữ liệu cấy ngay, không phải tự xác nhận nhận lại lần nữa.
const createSchema = z.object({
  plantTypeId: z.string().min(1, "Cần chọn mã cây"),
  mediumTypeId: z.string().min(1, "Cần chọn môi trường"),
  quantity: z.number().int().positive("Số lượng phải lớn hơn 0"),
  // Bỏ trống = tự giao cho chính Admin kỹ thuật đang tạo.
  assignedToId: z.string().min(1).optional(),
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
      assignedToId: true,
      assignedTo: { select: { code: true, name: true } },
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
  const { plantTypeId, mediumTypeId, quantity, assignedToId: requestedAssignedToId } = parsed.data;
  const assignedToId = requestedAssignedToId ?? session.user.id;

  const rndWarehouse = await getOrCreateRndWarehouse();

  const [plantType, mediumType, assignedStaff] = await Promise.all([
    prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { code: true } }),
    prisma.mediumType.findUnique({ where: { id: mediumTypeId }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: assignedToId }, select: { code: true, role: true, isActive: true, workplaceWarehouseId: true } }),
  ]);
  if (!plantType) return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  if (!mediumType) return NextResponse.json({ message: "Không tìm thấy môi trường" }, { status: 400 });
  if (!assignedStaff) return NextResponse.json({ message: "Không tìm thấy NV được giao" }, { status: 400 });
  // Tự giao cho chính mình luôn hợp lệ (Admin kỹ thuật) — giao cho người khác thì bắt buộc là NV cấy mô
  // THẬT, đang hoạt động, và đã được gán làm việc tại đúng Kho SX R&D (qua trang Người dùng).
  if (assignedToId !== session.user.id) {
    if (!assignedStaff.isActive || assignedStaff.role !== "CAY_MO" || assignedStaff.workplaceWarehouseId !== rndWarehouse.id) {
      return NextResponse.json({ message: "NV được giao không hợp lệ — cần là NV cấy mô đang làm việc tại Kho SX R&D" }, { status: 400 });
    }
  }

  const bucketShelf = await getOrCreateRndInputShelf(rndWarehouse.id, assignedToId);

  const now = new Date();
  const weekStart = toStoredWeekStart(startOfWeek(now, { weekStartsOn: 1 }));
  const lotCode = await generateLotCode({ plantTypeCode: plantType.code, staffCode: assignedStaff.code, stageCode: "M05" });
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
        assignedToId,
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
