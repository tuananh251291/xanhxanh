import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { generateRepackInstructionCode } from "@/lib/codes";
import { z } from "zod";

const OUTPUT_STAGE_CODES = ["T01", "T05", "T10"] as const;

const createSchema = z.object({
  sourceShelfId: z.string().min(1),
  sourceLotId: z.string().min(1),
  inputQuantity: z.number().int().positive(),
  outputStageCode: z.enum(OUTPUT_STAGE_CODES),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Không có quyền" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role === "CAY_MO") where.assignedToId = session.user.id;
  else if (role === "KY_THUAT") where.createdById = session.user.id;
  else if (role === "KHO_MO") {
    if (!session.user.workplaceWarehouseId) return NextResponse.json([]);
    where.sourceShelf = { warehouseId: session.user.workplaceWarehouseId };
  } else if (!isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const instructions = await prisma.repackInstruction.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true } },
      sourceShelf: { select: { code: true, name: true, warehouseId: true, warehouse: { select: { name: true } } } },
      sourceLot: { select: { code: true, quantity: true } },
      createdBy: { select: { name: true, code: true } },
      assignedTo: { select: { name: true, code: true } },
      actualOutputShelf: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(instructions);
}

// KY_THUAT (hoặc Admin) tạo "Chỉ định cấy xử lý" — chọn 1 lô CỤ THỂ đang nằm trên 1 kệ Phòng ra rễ làm
// đầu vào, muốn đóng gói lại sang quy cách khác. KHÔNG trừ tồn kho ở bước này — chỉ trừ khi NV cấy mô tự
// xác nhận "Nhận bàn giao" (xem PATCH /api/repack-instructions/[id] nhánh confirmReceived).
export async function POST(req: NextRequest) {
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "KY_THUAT" && !isAdminRole(role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { sourceShelfId, sourceLotId, inputQuantity, outputStageCode, notes } = parsed.data;

  const shelf = await prisma.shelf.findUnique({
    where: { id: sourceShelfId },
    select: { id: true, code: true, isActive: true, warehouseId: true, warehouse: { select: { code: true } }, room: { select: { type: true } } },
  });
  if (!shelf || !shelf.isActive || shelf.room?.type !== "PHONG_RA_RE") {
    return NextResponse.json({ message: "Kệ nguồn phải là 1 kệ đang hoạt động trong Phòng ra rễ" }, { status: 400 });
  }

  const lot = await prisma.lot.findUnique({
    where: { id: sourceLotId },
    select: { id: true, shelfId: true, status: true, quantity: true, stageCode: true, plantTypeId: true, plantType: { select: { code: true } } },
  });
  if (!lot || lot.shelfId !== sourceShelfId || lot.status !== "ACTIVE") {
    return NextResponse.json({ message: "Không tìm thấy lô đang hoạt động trên đúng kệ đã chọn" }, { status: 400 });
  }
  if (inputQuantity > lot.quantity) {
    return NextResponse.json({ message: `Số lượng đầu vào vượt quá tồn hiện có của lô (còn ${lot.quantity.toLocaleString("vi-VN")})` }, { status: 400 });
  }
  if (outputStageCode === lot.stageCode) {
    return NextResponse.json({ message: "Quy cách đầu ra phải khác quy cách hiện tại của lô" }, { status: 400 });
  }

  const code = await generateRepackInstructionCode({ warehouseCode: shelf.warehouse.code, shelfCode: shelf.code });

  const instruction = await prisma.repackInstruction.create({
    data: {
      code,
      plantTypeId: lot.plantTypeId,
      sourceShelfId,
      sourceLotId,
      inputStageCode: lot.stageCode,
      inputQuantity,
      outputStageCode,
      expectedOutputQuantity: inputQuantity, // đóng gói lại không sinh thêm cây — xem schema comment
      createdById: session!.user.id,
      notes,
      status: "CREATED",
    },
    include: {
      plantType: { select: { code: true, name: true } },
      sourceShelf: { select: { code: true } },
      sourceLot: { select: { code: true } },
    },
  });

  return NextResponse.json(instruction, { status: 201 });
}
