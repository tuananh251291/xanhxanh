import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { prepareRndInstruction, insertRndInstruction, validateRndAssignee } from "@/lib/rnd-instruction-create";
import { z } from "zod";

// "Tạo chỉ định cấy R&D" — Admin kỹ thuật tạo 1 chỉ định cấy THẬT tại "Kho sản xuất R&D" (xem
// src/lib/rnd-instruction-warehouse.ts), dùng mã cây/môi trường CÓ SẴN (không phải giống mới, khác hẳn
// TrialVariety/TrialCultivationRound — feature đó tách biệt hoàn toàn khỏi kho thật). Giao cho CHÍNH MÌNH
// (mặc định, không truyền assignedToId) hoặc cho 1 NV cấy mô THẬT đang làm việc ở bất kỳ khu sản xuất nào
// (28/10/2026 — trước đó chỉ NV gán làm việc tại Kho sản xuất R&D, xem validateRndAssignee). Gộp cả 3 bước "tạo → bàn giao → nhận mẫu mẹ" thành 1
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

  const [plantType, mediumType, assigneeError] = await Promise.all([
    prisma.plantType.findUnique({ where: { id: plantTypeId }, select: { code: true } }),
    prisma.mediumType.findUnique({ where: { id: mediumTypeId }, select: { id: true } }),
    validateRndAssignee(assignedToId, session.user.id),
  ]);
  if (!plantType) return NextResponse.json({ message: "Không tìm thấy mã cây" }, { status: 400 });
  if (!mediumType) return NextResponse.json({ message: "Không tìm thấy môi trường" }, { status: 400 });
  if (assigneeError) return NextResponse.json({ message: assigneeError }, { status: 400 });

  const prep = await prepareRndInstruction({ plantTypeCode: plantType.code, assignedToId });
  const instruction = await prisma.$transaction((tx) =>
    insertRndInstruction(tx, prep, { plantTypeId, mediumTypeId, quantity, createdById: session.user.id, assignedToId })
  );

  return NextResponse.json(instruction, { status: 201 });
}
