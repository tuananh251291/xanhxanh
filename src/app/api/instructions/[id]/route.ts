import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const instruction = await prisma.plantingInstruction.findUnique({
    where: { id },
    include: {
      plantType: true,
      mediumType: true,
      createdBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      items: { include: { shelf: { include: { warehouse: true } } } },
      dailyRecords: {
        include: {
          staff: { select: { name: true } },
          items: { include: { lot: { select: { code: true, stage: true, quantity: true } } } },
        },
        orderBy: { recordDate: "desc" },
      },
      lots: { where: { status: "ACTIVE" }, include: { shelf: true } },
    },
  });
  if (!instruction) return NextResponse.json({ error: "Không tìm thấy" }, { status: 404 });
  return NextResponse.json(instruction);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!["ADMIN", "KY_THUAT"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const { status } = body;
  if (!status) return NextResponse.json({ message: "Thiếu trường status" }, { status: 400 });
  const updated = await prisma.plantingInstruction.update({ where: { id }, data: { status } });
  return NextResponse.json(updated);
}
