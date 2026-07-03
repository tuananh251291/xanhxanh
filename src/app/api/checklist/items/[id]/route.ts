import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const schema = z.object({ completed: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const item = await prisma.checklistItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ message: "Không tìm thấy" }, { status: 404 });
  if (item.userId !== session.user.id) {
    return NextResponse.json({ message: "Không có quyền" }, { status: 403 });
  }

  const updated = await prisma.checklistItem.update({
    where: { id },
    data: {
      completed: parsed.data.completed,
      completedAt: parsed.data.completed ? new Date() : null,
    },
  });

  return NextResponse.json(updated);
}
