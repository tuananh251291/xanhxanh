import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const schema = z.object({
  lotId: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { lotId, quantity, notes } = parsed.data;

  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    include: { instruction: { select: { assignedToId: true, code: true, inputMotherQuantity: true } } },
  });
  if (!lot) return NextResponse.json({ message: "Không tìm thấy lô" }, { status: 404 });
  if (quantity > lot.quantity) return NextResponse.json({ message: "Số lượng nhiễm vượt quá tồn kho" }, { status: 400 });

  // Tạo record nhiễm (pending xác nhận)
  const record = await prisma.contaminationRecord.create({
    data: { lotId, quantity, notes },
  });

  // Kiểm tra tỉ lệ nhiễm
  const contaminated = await prisma.contaminationRecord.aggregate({
    where: { lotId },
    _sum: { quantity: true },
  });
  const totalContaminated = contaminated._sum.quantity ?? 0;
  const contaminationRate = totalContaminated / lot.initialQuantity;

  if (contaminationRate > 0.2) {
    await createAlert({
      type: "CONTAMINATION_HIGH",
      title: "Tỉ lệ nhiễm cao",
      message: `Lô ${lot.code}: ${Math.round(contaminationRate * 100)}% bị nhiễm`,
      targetRole: "KY_THUAT",
      relatedId: lotId,
      relatedType: "Lot",
    });
  }

  return NextResponse.json(record, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "KHO_MO") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const body = await req.json();
  const { id } = body;
  if (!id) return NextResponse.json({ message: "Thiếu ID" }, { status: 400 });

  const record = await prisma.contaminationRecord.findUnique({
    where: { id },
    include: { lot: true },
  });
  if (!record) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });

  // Xác nhận: trừ tồn kho lô
  await prisma.$transaction([
    prisma.contaminationRecord.update({
      where: { id },
      data: { confirmedAt: new Date(), confirmedById: session.user.id },
    }),
    prisma.lot.update({
      where: { id: record.lotId },
      data: { quantity: { decrement: record.quantity } },
    }),
  ]);

  return NextResponse.json({ success: true });
}
