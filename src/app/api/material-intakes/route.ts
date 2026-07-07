import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({
  materialId: z.string(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

// NV môi trường nhập vật tư về kho — cộng dồn vào Material.quantity, lưu lịch sử.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV môi trường mới có quyền nhập vật tư" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { materialId, quantity, notes } = parsed.data;
  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material || !material.isActive) return NextResponse.json({ message: "Không tìm thấy vật tư" }, { status: 404 });

  const [, intake] = await prisma.$transaction([
    prisma.material.update({ where: { id: materialId }, data: { quantity: { increment: quantity } } }),
    prisma.materialIntake.create({
      data: { materialId, quantity, notes, createdById: session.user.id },
      include: { material: { select: { code: true, name: true } } },
    }),
  ]);

  return NextResponse.json(intake, { status: 201 });
}
