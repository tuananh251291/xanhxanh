import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateInstructionCode } from "@/lib/codes";
import { isAdminRole } from "@/types";
import { z } from "zod";

// Mỗi dòng = 1 quy cách nguồn (M3 hoặc M5) được dùng, lấy từ 1 lô cụ thể trên 1 kệ. Một kệ có thể sinh
// nhiều dòng nếu kệ đó có cả M3 và M5. Mỗi dòng tự có tỉ lệ + môi trường riêng — output KHÔNG dây chuyền
// qua nhau: dự kiến mẫu mẹ = quantity × motherSampleRatio, dự kiến thành phẩm = quantity × rootingRatio
// (độc lập). Môi trường cũng tách riêng: 1 để nhân mẫu mẹ, 1 để ra rễ thành cây thành phẩm.
const shelfItemSchema = z.object({
  shelfId: z.string(),
  lotId: z.string(),
  stageCode: z.enum(["M3", "M5"]),
  quantity: z.number().int().positive(),
  motherSampleRatio: z.number().positive(),
  rootingRatio: z.number().positive(),
  motherMediumTypeId: z.string().min(1),
  finishedMediumTypeId: z.string().min(1),
});

const createSchema = z.object({
  plantTypeId: z.string(),
  weekStart: z.string().optional(),
  notes: z.string().optional(),
  shelfItems: z.array(shelfItemSchema).min(1, "Cần chọn ít nhất 1 dòng quy cách nguồn"),
  // Kế hoạch phân bổ thành phẩm dự kiến theo quy cách đóng gói (T01/T05) — chỉ để đối chiếu sau này,
  // lô thành phẩm thật sự tạo ra khi NV cấy nhập nhật ký sẽ tự chọn quy cách theo thực tế.
  plannedT01Quantity: z.number().int().min(0).default(0),
  plannedT05Quantity: z.number().int().min(0).default(0),
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
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      items: {
        include: {
          shelf: { select: { code: true, name: true } },
          motherMedium: { select: { code: true, name: true } },
          finishedMedium: { select: { code: true, name: true } },
        },
      },
      _count: { select: { dailyRecords: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(instructions);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role) && session?.user?.role !== "KY_THUAT") {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ", errors: parsed.error.flatten() }, { status: 400 });

  const { shelfItems, plantTypeId, weekStart, notes, plannedT01Quantity, plannedT05Quantity } = parsed.data;

  const itemsWithOutput = shelfItems.map((item) => ({
    ...item,
    expectedMotherOutput: Math.floor(item.quantity * item.motherSampleRatio),
    expectedFinishedOutput: Math.floor(item.quantity * item.rootingRatio),
  }));

  const inputMotherQuantity = itemsWithOutput.reduce((sum, item) => sum + item.quantity, 0);
  const expectedMotherOutput = itemsWithOutput.reduce((sum, item) => sum + item.expectedMotherOutput, 0);
  const expectedFinishedOutput = itemsWithOutput.reduce((sum, item) => sum + item.expectedFinishedOutput, 0);

  const code = await generateInstructionCode();

  const instruction = await prisma.plantingInstruction.create({
    data: {
      code,
      plantType: { connect: { id: plantTypeId } },
      createdBy: { connect: { id: session!.user.id } },
      notes,
      inputMotherQuantity,
      expectedMotherOutput,
      expectedFinishedOutput,
      plannedT01Quantity,
      plannedT05Quantity,
      weekStart: weekStart ? new Date(weekStart) : undefined,
      status: "ACTIVE",
      items: {
        create: itemsWithOutput.map((item) => ({
          shelfId: item.shelfId,
          lotId: item.lotId,
          stageCode: item.stageCode,
          quantity: item.quantity,
          motherSampleRatio: item.motherSampleRatio,
          rootingRatio: item.rootingRatio,
          expectedMotherOutput: item.expectedMotherOutput,
          expectedFinishedOutput: item.expectedFinishedOutput,
          motherMediumTypeId: item.motherMediumTypeId,
          finishedMediumTypeId: item.finishedMediumTypeId,
        })),
      },
    },
    include: {
      plantType: true,
      assignedTo: { select: { name: true } },
      items: { include: { shelf: true, lot: true, motherMedium: true, finishedMedium: true } },
    },
  });

  return NextResponse.json(instruction, { status: 201 });
}
