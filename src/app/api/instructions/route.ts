import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateInstructionCode } from "@/lib/codes";
import { z } from "zod";

const createSchema = z.object({
  plantTypeId: z.string(),
  mediumTypeId: z.string().optional(),
  assignedToId: z.string(),
  inputMotherQuantity: z.number().int().positive(),
  motherSampleRatio: z.number().positive().optional(),
  rootingRatio: z.number().positive().optional(),
  weekStart: z.string().optional(),
  notes: z.string().optional(),
  shelfItems: z.array(z.object({ shelfId: z.string(), quantity: z.number().int().positive() })).optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const role = session.user.role;
  const userId = session.user.id;

  const where: Record<string, unknown> = {};
  if (role === "CAY_MO") where.assignedToId = userId;
  if (role === "KY_THUAT") where.createdById = userId;

  const status = searchParams.get("status");
  if (status) where.status = status;

  const instructions = await prisma.plantingInstruction.findMany({
    where,
    include: {
      plantType: { select: { code: true, name: true } },
      mediumType: { select: { code: true, name: true } },
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      items: { include: { shelf: { select: { code: true, name: true } } } },
      _count: { select: { dailyRecords: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(instructions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!["ADMIN", "KY_THUAT"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { shelfItems, ...data } = parsed.data;

  // Tự tính expected output
  let expectedMotherOutput: number | undefined;
  let expectedFinishedOutput: number | undefined;
  if (data.motherSampleRatio) expectedMotherOutput = Math.floor(data.inputMotherQuantity * data.motherSampleRatio);
  if (data.rootingRatio && expectedMotherOutput) expectedFinishedOutput = Math.floor(expectedMotherOutput * data.rootingRatio);

  const code = await generateInstructionCode();

  const instruction = await prisma.plantingInstruction.create({
    data: {
      code,
      ...data,
      createdById: session!.user.id,
      expectedMotherOutput,
      expectedFinishedOutput,
      weekStart: data.weekStart ? new Date(data.weekStart) : undefined,
      status: "ACTIVE",
      items: shelfItems ? {
        create: shelfItems.map((item) => ({ shelfId: item.shelfId, quantity: item.quantity })),
      } : undefined,
    },
    include: {
      plantType: true,
      assignedTo: { select: { name: true } },
      items: { include: { shelf: true } },
    },
  });

  return NextResponse.json(instruction, { status: 201 });
}
