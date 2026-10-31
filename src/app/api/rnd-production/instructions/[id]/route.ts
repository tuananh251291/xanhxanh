import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { validateRndAssignee } from "@/lib/rnd-instruction-create";
import { getOrCreateRndInputShelf } from "@/lib/rnd-instruction-warehouse";
import { toStoredWeekStart } from "@/lib/week-rotation";
import { startOfWeek } from "date-fns";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "ADMIN_KY_THUAT") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      status: true,
      weekStart: true,
      inputMotherQuantity: true,
      createdById: true,
      plantType: { select: { code: true, name: true } },
      items: { select: { motherMedium: { select: { code: true, name: true } } } },
    },
  });
  if (!instruction || instruction.createdById !== session.user.id) {
    return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  }

  return NextResponse.json(instruction);
}

const reassignSchema = z.object({
  // null = giao lại cho chính Admin đang thao tác.
  assignedToId: z.string().min(1).nullable(),
});

// Giao lại 1 chỉ định cấy R&D ĐANG CHẠY (Cấy sản xuất R&D hoặc lượt cấy giống thử nghiệm) cho NV cấy mô khác /
// chính mình — chỉ khi CHƯA có dữ liệu cấy nào (dữ liệu đã nhập thuộc về người cũ). Lô mẫu mẹ của chỉ định
// chuyển sang kệ mẫu mẹ ẩn của người mới (getOrCreateRndInputShelf) cho khớp người đang giữ mẫu mẹ.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !isAdminRole(session.user.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  const parsed = reassignSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  const assignedToId = parsed.data.assignedToId ?? session.user.id;

  const { id } = await params;
  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id },
    select: {
      id: true, status: true, assignedToId: true,
      _count: { select: { dailyRecords: true } },
      items: { select: { id: true, lotId: true, shelf: { select: { warehouseId: true, warehouse: { select: { isRnd: true } } } } } },
    },
  });
  if (!instruction) return NextResponse.json({ message: "Không tìm thấy chỉ định" }, { status: 404 });
  const warehouseId = instruction.items[0]?.shelf?.warehouseId;
  if (!warehouseId || !instruction.items.every((i) => i.shelf?.warehouse.isRnd)) {
    return NextResponse.json({ message: "Chỉ giao lại được chỉ định cấy R&D" }, { status: 400 });
  }
  if (instruction.status !== "ACTIVE" && instruction.status !== "DRAFT") {
    return NextResponse.json({ message: "Chỉ định đã kết thúc — không giao lại được" }, { status: 400 });
  }
  if (instruction._count.dailyRecords > 0) {
    return NextResponse.json({ message: "Chỉ định đã có dữ liệu cấy — không giao lại được" }, { status: 400 });
  }
  if (assignedToId === instruction.assignedToId) return NextResponse.json({ success: true });
  const assigneeError = await validateRndAssignee(assignedToId, session.user.id);
  if (assigneeError) return NextResponse.json({ message: assigneeError }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    const shelf = await getOrCreateRndInputShelf(warehouseId, assignedToId, tx);
    // Giao cho NV cấy mô (không phải chính Admin) → "Tuần thực hiện" theo đúng lúc giao: trang Nhập dữ liệu
    // cấy của NV chỉ hiện chỉ định thuộc TUẦN HIỆN TẠI, lượt cấy tạo từ tuần trước mà giữ weekStart cũ thì NV
    // không thấy để nhập (giống assignExtraWorkRequestId ở PATCH /api/instructions/[id]).
    const weekStart = assignedToId !== session.user.id
      ? toStoredWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
      : undefined;
    await tx.plantingInstruction.update({ where: { id }, data: { assignedToId, ...(weekStart ? { weekStart } : {}) } });
    await tx.plantingInstructionItem.updateMany({ where: { instructionId: id }, data: { shelfId: shelf.id } });
    const lotIds = instruction.items.map((i) => i.lotId).filter((x): x is string => !!x);
    if (lotIds.length > 0) await tx.lot.updateMany({ where: { id: { in: lotIds } }, data: { shelfId: shelf.id } });
  });
  return NextResponse.json({ success: true });
}
