import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isAdminRole } from "@/types";
import { z } from "zod";

const patchSchema = z.object({
  userIds: z.array(z.string()),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const { id } = await params;
  const access = await prisma.roomAccess.findMany({
    where: { roomId: id },
    select: { userId: true },
  });
  return NextResponse.json({ userIds: access.map((a) => a.userId) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isAdminRole(session?.user?.role)) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  await prisma.$transaction([
    prisma.roomAccess.deleteMany({ where: { roomId: id } }),
    prisma.roomAccess.createMany({
      data: parsed.data.userIds.map((userId) => ({ userId, roomId: id })),
    }),
  ]);

  return NextResponse.json({ success: true });
}
