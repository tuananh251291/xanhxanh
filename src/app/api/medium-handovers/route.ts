import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { generateMediumHandoverCode } from "@/lib/codes";
import { createAlert } from "@/lib/inventory";
import { z } from "zod";

const createSchema = z.object({
  toUserId: z.string().min(1, "Cần chọn NV cấy nhận"),
  notes: z.string().optional(),
  items: z.array(z.object({
    mediumTypeId: z.string(),
    instructionId: z.string().optional(),
    purpose: z.enum(["MOTHER", "FINISHED"]),
    quantity: z.number().int().positive(),
  })).min(1, "Cần chọn ít nhất 1 nhiệm vụ"),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const role = session.user.role;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (role === "MOI_TRUONG") where.fromUserId = session.user.id;
  if (role === "CAY_MO") where.toUserId = session.user.id;

  const handovers = await prisma.mediumHandover.findMany({
    where,
    include: {
      fromUser: { select: { name: true } },
      toUser: { select: { name: true } },
      items: {
        include: {
          mediumType: { select: { code: true, name: true } },
          instruction: { select: { code: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(handovers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "MOI_TRUONG") {
    return NextResponse.json({ message: "Chỉ NV đổ môi trường mới tạo được phiếu bàn giao" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { toUserId, notes, items } = parsed.data;
  const toUser = await prisma.user.findUnique({ where: { id: toUserId } });
  if (!toUser || toUser.role !== "CAY_MO") {
    return NextResponse.json({ message: "Người nhận phải là nhân viên cấy mô" }, { status: 400 });
  }

  const code = await generateMediumHandoverCode();

  const handover = await prisma.mediumHandover.create({
    data: {
      code,
      fromUserId: session.user.id,
      toUserId,
      notes,
      items: { create: items },
    },
    include: { items: true },
  });

  await createAlert({
    type: "MEDIUM_HANDOVER_READY",
    title: "Có phiếu bàn giao môi trường chờ nhận",
    message: `${session.user.name} đã gửi phiếu ${code} — ${items.length} dòng môi trường, chờ xác nhận`,
    userId: toUserId,
    relatedId: handover.id,
    relatedType: "MediumHandover",
  });

  return NextResponse.json(handover, { status: 201 });
}
