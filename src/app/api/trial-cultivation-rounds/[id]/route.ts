import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const recordResultSchema = z.object({
  outputQuantity: z.number().int().min(0, "Số lượng không được âm"),
  notes: z.string().trim().optional(),
});

// Ghi nhận kết quả 1 lượt cấy — chỉ nhập được 1 lần (outputQuantity đã có thì coi như lượt đã xong,
// KHÔNG cho sửa lại qua endpoint này, tránh ghi đè nhầm số liệu đã chốt).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const round = await prisma.trialCultivationRound.findUnique({ where: { id }, select: { id: true, outputQuantity: true } });
  if (!round) return NextResponse.json({ message: "Không tìm thấy lượt cấy" }, { status: 404 });
  if (round.outputQuantity !== null) {
    return NextResponse.json({ message: "Lượt cấy này đã ghi nhận kết quả rồi" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = recordResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const updated = await prisma.trialCultivationRound.update({
    where: { id },
    data: { outputQuantity: parsed.data.outputQuantity, notes: parsed.data.notes || undefined, recordedAt: new Date() },
    select: { id: true, outputQuantity: true, recordedAt: true },
  });
  return NextResponse.json(updated);
}
