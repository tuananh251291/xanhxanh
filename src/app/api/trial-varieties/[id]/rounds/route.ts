import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { addWeeks } from "date-fns";
import { z } from "zod";
import { prepareRndInstruction, insertRndInstruction } from "@/lib/rnd-instruction-create";

const startRoundSchema = z.object({
  motherInputQuantity: z.number().int().positive("Số lượng mẫu mẹ phải lớn hơn 0"),
  waitWeeks: z.number().int().positive("Số tuần chờ phải lớn hơn 0"),
  notes: z.string().trim().optional(),
});

// Bắt đầu 1 lượt cấy mới cho giống — Admin tự nhập số tuần chờ (KHÔNG dùng Nhóm tuần xoay vòng như mẫu
// mẹ thật, xem comment đầu khối model TrialVariety) — expectedReadyAt = hôm nay + waitWeeks tuần, dùng
// để gợi ý "đến tuổi cấy" ở GET /api/trial-varieties/due-rounds.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const variety = await prisma.trialVariety.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!variety) return NextResponse.json({ message: "Không tìm thấy giống" }, { status: 404 });

  const body = await req.json();
  const parsed = startRoundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const plantedAt = new Date();
  const expectedReadyAt = addWeeks(plantedAt, parsed.data.waitWeeks);

  // Mỗi lượt cấy = 1 chỉ định cấy thật tại Kho sản xuất R&D giao cho người bắt đầu lượt (kết quả nhập theo chỉ
  // định) — giống đã có mã cây sản xuất cùng mã (xem ensurePlantTypeForTrialVariety).
  const plantType = await prisma.plantType.findUnique({ where: { code: variety.code }, select: { id: true, code: true } });
  if (!plantType) return NextResponse.json({ message: `Giống ${variety.code} chưa có mã cây sản xuất — liên hệ kỹ thuật` }, { status: 400 });
  const userId = session!.user!.id;
  const prep = await prepareRndInstruction({ plantTypeCode: plantType.code, assignedToId: userId });

  const round = await prisma.$transaction(async (tx) => {
  const instruction = await insertRndInstruction(tx, prep, {
    plantTypeId: plantType.id, mediumTypeId: null, quantity: parsed.data.motherInputQuantity, createdById: userId, assignedToId: userId, at: plantedAt,
  });
  return tx.trialCultivationRound.create({
    data: {
      instructionId: instruction.id,
      trialVarietyId: id,
      motherInputQuantity: parsed.data.motherInputQuantity,
      waitWeeks: parsed.data.waitWeeks,
      plantedAt,
      expectedReadyAt,
      notes: parsed.data.notes || null,
      createdById: session!.user!.id,
    },
    select: { id: true, plantedAt: true, expectedReadyAt: true, instructionId: true },
  });
  });
  return NextResponse.json(round, { status: 201 });
}
