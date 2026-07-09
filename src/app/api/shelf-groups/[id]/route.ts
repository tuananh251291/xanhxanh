import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().min(1, "Cần nhập tên nhóm"),
  type: z.string().trim().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ message: "Dữ liệu không hợp lệ" }, { status: 400 });

  const group = await prisma.shelfGroup.update({ where: { id }, data: { name: parsed.data.name, type: parsed.data.type || null } });
  return NextResponse.json(group);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") return NextResponse.json({ message: "Không có quyền" }, { status: 403 });

  const { id } = await params;
  // Gỡ Nhóm khỏi mọi kệ đang gán trước khi xoá — không xoá kệ, chỉ bỏ groupId (thuộc tính không bắt buộc).
  await prisma.$transaction([
    prisma.shelf.updateMany({ where: { groupId: id }, data: { groupId: null } }),
    prisma.shelfGroup.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
