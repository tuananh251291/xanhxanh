import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const patchSchema = z.union([
  z.object({ status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]) }),
  z.object({ assignedToId: z.string().min(1) }),
]);

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
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const isAssignAction = "assignedToId" in parsed.data;
  const role = session?.user?.role;
  const allowed = isAssignAction
    ? isAdminRole(role) || role === "KHO_MO"
    : isAdminRole(role) || role === "KY_THUAT";
  if (!allowed) return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const updated = await prisma.plantingInstruction.update({
    where: { id },
    data: parsed.data,
    include: { assignedTo: { select: { name: true } } },
  });
  return NextResponse.json(updated);
}
