import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const STAGE_CODES = ["M3", "M5"] as const;

const patchSchema = z.object({
  changes: z.array(z.object({
    plantTypeId: z.string(),
    stageCode: z.enum(STAGE_CODES),
    motherSampleRatio: z.coerce.number().positive(),
    rootingRatio: z.coerce.number().positive(),
    motherMediumTypeId: z.string().min(1),
    finishedMediumTypeId: z.string().min(1),
  })),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const plantTypeId = searchParams.get("plantTypeId");

  const specs = await prisma.plantTypeSpec.findMany({
    where: plantTypeId ? { plantTypeId } : undefined,
    include: {
      motherMedium: { select: { id: true, code: true, name: true } },
      finishedMedium: { select: { id: true, code: true, name: true } },
    },
  });
  return NextResponse.json(specs);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  await prisma.$transaction(
    parsed.data.changes.map((c) =>
      prisma.plantTypeSpec.upsert({
        where: { plantTypeId_stageCode: { plantTypeId: c.plantTypeId, stageCode: c.stageCode } },
        update: {
          motherSampleRatio: c.motherSampleRatio,
          rootingRatio: c.rootingRatio,
          motherMediumTypeId: c.motherMediumTypeId,
          finishedMediumTypeId: c.finishedMediumTypeId,
        },
        create: c,
      })
    )
  );

  return NextResponse.json({ success: true });
}
