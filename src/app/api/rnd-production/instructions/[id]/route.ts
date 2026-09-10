import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

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
