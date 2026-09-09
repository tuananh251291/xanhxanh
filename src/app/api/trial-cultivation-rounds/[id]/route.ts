import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const recordResultSchema = z.object({
  motherContaminatedM05: z.number().int().min(0, "Số lượng không được âm"),
  motherUsed: z.number().int().min(0, "Số lượng không được âm"),
  m05Quantity: z.number().int().min(0, "Số lượng không được âm"),
  t05Quantity: z.number().int().min(0, "Số lượng không được âm"),
  t01Quantity: z.number().int().min(0, "Số lượng không được âm"),
  mediumTypeId: z.string().optional(),
  notes: z.string().trim().optional(),
});

// Ghi nhận kết quả 1 lượt cấy — "Cập nhật dữ liệu cấy" giống hệt form NV cấy mô (xem
// TrialRoundResultDialog) — chỉ nhập được 1 LẦN (recordedAt đã có thì coi như lượt đã xong, KHÔNG cho
// sửa lại qua endpoint này, tránh ghi đè nhầm số liệu đã chốt).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const round = await prisma.trialCultivationRound.findUnique({ where: { id }, select: { id: true, recordedAt: true } });
  if (!round) return NextResponse.json({ message: "Không tìm thấy lượt cấy" }, { status: 404 });
  if (round.recordedAt !== null) {
    return NextResponse.json({ message: "Lượt cấy này đã ghi nhận kết quả rồi" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = recordResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { motherContaminatedM05, motherUsed, m05Quantity, t05Quantity, t01Quantity, mediumTypeId, notes } = parsed.data;

  if (mediumTypeId) {
    const medium = await prisma.mediumType.findUnique({ where: { id: mediumTypeId }, select: { isActive: true } });
    if (!medium || !medium.isActive) {
      return NextResponse.json({ message: "Loại môi trường không hợp lệ" }, { status: 400 });
    }
  }

  const updated = await prisma.trialCultivationRound.update({
    where: { id },
    data: {
      motherContaminatedM05,
      motherUsed,
      motherChecked: motherUsed + motherContaminatedM05,
      m05Quantity,
      t05Quantity,
      t01Quantity,
      mediumTypeId: mediumTypeId || undefined,
      notes: notes || undefined,
      recordedAt: new Date(),
      recordedById: session!.user!.id,
    },
    select: { id: true, recordedAt: true },
  });
  return NextResponse.json(updated);
}
