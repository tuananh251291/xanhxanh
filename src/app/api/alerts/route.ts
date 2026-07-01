import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {
    OR: [{ userId: session.user.id }, { targetRole: session.user.role }],
  };
  if (status) where.status = status;

  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(alerts);
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(["READ", "RESOLVED"]),
});

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const { id, status } = parsed.data;

  const alert = await prisma.alert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (alert.userId !== session.user.id && alert.targetRole !== session.user.role) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { status, readAt: alert.readAt ?? new Date() },
  });

  return NextResponse.json(updated);
}
